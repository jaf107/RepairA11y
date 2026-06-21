/**
 * End-to-end repair experiment runner for live D_r sites (SC 2.4.13 only).
 *
 * CLI:
 *   --level E3      evidence level (default E3)
 *   --limit 5       max sites to process (default 5)
 *   --url <url>     run on a single URL only
 *   --dry           stub LLM — no API calls, uses a no-op css_inject patch
 *
 * Requires OPENROUTER_API_KEY in env unless --dry.
 */
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { detectWithPatchLive } from "../../src/verifier/runWithPatchLive.js";
import { diffViolations } from "../../src/verifier/diff.js";
import { compareScreenshots } from "../../src/verifier/ssim.js";
import { annotateWithBbox } from "../../src/showcase/screenshot.js";
import { runDetection, sanitizeUrl } from "../../src/detector/index.js";
import { packageEvidence } from "../../src/evidence/packager.js";
import { createLlmGenerator } from "../../src/generators/llm_based/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCAN_RESULTS_DIR = join(__dirname, "../dr_detection_scan/results");
const REPAIR_RESULTS_DIR = join(__dirname, "results");
const SCREENSHOTS_DIR = join(__dirname, "screenshots");

function parseArgs() {
  const argv = process.argv.slice(2);
  const get = (flag) => {
    const i = argv.indexOf(flag);
    return i !== -1 ? argv[i + 1] : null;
  };
  return {
    level: get("--level") ?? "E3",
    limit: parseInt(get("--limit") ?? "5", 10),
    url: get("--url") ?? null,
    dry: argv.includes("--dry"),
  };
}

function createDryGenerator() {
  return {
    generate: async () => ({
      patch_type: "css_inject",
      target_selector: ":root",
      payload: { rule: "/* dry-run */" },
      rationale: "dry-run stub — no API call",
      wcag_technique_cited: null,
    }),
    usage: { calls: [] },
  };
}

async function latestScanPath() {
  const files = (await readdir(SCAN_RESULTS_DIR))
    .filter((f) => f.startsWith("scan-") && f.endsWith(".json"))
    .sort()
    .reverse();
  if (!files.length) throw new Error("No scan-*.json found in dr_detection_scan/results/");
  return join(SCAN_RESULTS_DIR, files[0]);
}

function resolveStatus(delta) {
  if (delta.newFailures.length > 0) return "REGRESSED";
  if (delta.resolved.length > 0) return "RESOLVED";
  return "UNRESOLVED";
}

function printTable(results) {
  const cols = ["url", "status", "ssim", "selector"];
  const rows = results.map((r) => [
    r.url.replace("https://", "").replace("http://", "").slice(0, 40),
    r.status,
    r.ssim?.similarity != null ? r.ssim.similarity.toFixed(3) : "n/a",
    (r.violationSelector ?? "").slice(0, 50),
  ]);

  const widths = cols.map((c, i) =>
    Math.max(c.length, ...rows.map((r) => r[i].length)),
  );
  const fmt = (row) => row.map((v, i) => v.padEnd(widths[i])).join("  ");

  console.log("\n" + fmt(cols));
  console.log(widths.map((w) => "-".repeat(w)).join("  "));
  for (const row of rows) console.log(fmt(row));
  console.log();
}

async function main() {
  const opts = parseArgs();

  const scanPath = await latestScanPath();
  const scan = JSON.parse(await readFile(scanPath, "utf8"));

  let sites = scan.results.filter(
    (r) => r.status === "ok" && (r.bySc?.["2.4.13"] ?? 0) > 0,
  );

  if (opts.url) {
    sites = sites.filter((r) => r.url === opts.url);
    if (!sites.length) {
      console.error(`URL not found in scan or has no 2.4.13 violations: ${opts.url}`);
      process.exit(1);
    }
  }

  sites = sites.slice(0, opts.limit);
  console.log(`Processing ${sites.length} site(s) — level=${opts.level} dry=${opts.dry}`);

  const generator = opts.dry
    ? createDryGenerator()
    : createLlmGenerator({ evidenceLevel: opts.level });

  await mkdir(REPAIR_RESULTS_DIR, { recursive: true });
  await mkdir(SCREENSHOTS_DIR, { recursive: true });

  const results = [];

  for (const site of sites) {
    const { url } = site;
    console.log(`\n→ ${url}`);
    try {
      const detection = await runDetection({ url });
      const violation = detection.violations.find(
        (v) => v.sc === "2.4.13" && v.result === "FAIL",
      );
      if (!violation) {
        results.push({ url, status: "NO_FAIL", sc: "2.4.13", evidenceLevel: opts.level });
        continue;
      }

      const evidence = await packageEvidence({
        violation,
        level: opts.level,
        htmlPath: null,
        screenshotPath: violation.screenshot ?? null,
      });

      const patch = await generator.generate({ violation, evidence });
      if (!patch) {
        results.push({
          url,
          violationSelector: violation.element?.selector ?? null,
          sc: "2.4.13",
          evidenceLevel: opts.level,
          status: "NO_PATCH",
          patch: null,
          ssim: null,
        });
        continue;
      }

      const { baselineDetection, patchedDetection, baselineScreenshotPath, screenshotPath } =
        await detectWithPatchLive({ url, patch });

      const delta = diffViolations(
        baselineDetection.violations,
        patchedDetection.violations,
        { scFilter: "2.4.13" },
      );

      let ssim;
      try {
        ssim = await compareScreenshots(baselineScreenshotPath, screenshotPath);
      } catch (e) {
        ssim = { similarity: null, error: e.message };
      }

      const siteDir = join(SCREENSHOTS_DIR, sanitizeUrl(url));
      await mkdir(siteDir, { recursive: true });
      const beforePath = join(siteDir, "before.png");
      const afterPath = join(siteDir, "after.png");
      const bbox = violation.element?.bbox ?? null;

      if (bbox) {
        await annotateWithBbox({ inputPath: baselineScreenshotPath, bbox, outputPath: beforePath });
        await annotateWithBbox({ inputPath: screenshotPath, bbox, outputPath: afterPath });
      } else {
        // No bbox available — copy screenshots without annotation
        const { copyFile } = await import("node:fs/promises");
        await copyFile(baselineScreenshotPath, beforePath);
        await copyFile(screenshotPath, afterPath);
      }

      const status = resolveStatus(delta);
      console.log(`  ${status}  selector=${violation.element?.selector}`);

      results.push({
        url,
        violationSelector: violation.element?.selector ?? null,
        sc: "2.4.13",
        evidenceLevel: opts.level,
        status,
        patch,
        ssim,
        resolved: delta.resolved.length,
        newFailures: delta.newFailures.length,
        beforePath,
        afterPath,
      });
    } catch (e) {
      console.error(`  ERROR: ${e.message}`);
      results.push({
        url,
        sc: "2.4.13",
        evidenceLevel: opts.level,
        status: "ERROR",
        error: e.message,
      });
    }
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = join(REPAIR_RESULTS_DIR, `run-${timestamp}.json`);
  const summary = {
    total: results.length,
    resolved: results.filter((r) => r.status === "RESOLVED").length,
    unresolved: results.filter((r) => r.status === "UNRESOLVED").length,
    regressed: results.filter((r) => r.status === "REGRESSED").length,
    errors: results.filter((r) => r.status === "ERROR").length,
  };

  await writeFile(
    outPath,
    JSON.stringify({ opts, summary, results }, null, 2),
  );

  printTable(results);
  console.log(`Summary:`, summary);
  console.log(`Results → ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
