#!/usr/bin/env node
/**
 * validate-patch — apply a single typed patch to a URL or local HTML file
 * and report what the verifier sees: target resolved? new failures introduced?
 * SSIM stability? Use this to sanity-check hand-written patches or one-off
 * LLM outputs without spinning up a full experiment.
 *
 * Usage:
 *   npm run validate:patch -- <url-or-file> <patch.json> [options]
 *
 * Options:
 *   --target-sc <sc>          SC the patch targets (default: inferred from patch)
 *   --target-selector <sel>   element the patch targets (default: patch.target_selector)
 *   --json <path>             write detailed JSON output
 *
 * The patch file may contain either:
 *   (a) a raw patch object matching src/schemas/patch.schema.json, or
 *   (b) a ground-truth object: { fixture, sc, patch } — in which case the
 *       fixture path is ignored (use the explicit url-or-file argument).
 *
 * Examples:
 *   npm run validate:patch -- ./my-page.html ./ground-truth/sc-2.4.13-*.json
 *   npm run validate:patch -- https://example.com ./candidate-patch.json
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { isAbsolute, resolve, dirname } from "node:path";
import { existsSync } from "node:fs";
import { runDetection } from "../src/detector/index.js";
import { verify } from "../src/verifier/index.js";
import { validatePatch } from "../src/patches/validate.js";
import { fetchPageToFile } from "../src/utils/fetchPage.js";

function parseArgs(argv) {
  const args = argv.slice(2);
  if (args.length < 2 || args[0] === "--help" || args[0] === "-h") {
    console.log(`
Usage: npm run validate:patch -- <url-or-file> <patch.json> [options]

Options:
  --target-sc <sc>          SC the patch targets (default: inferred from patch)
  --target-selector <sel>   element the patch targets (default: patch.target_selector)
  --json <path>             write detailed JSON output

Examples:
  npm run validate:patch -- ./my-page.html ./ground-truth/sc-2.4.13-focus-appearance-outline-contrast.json
  npm run validate:patch -- https://example.com ./candidate-patch.json
`);
    process.exit(0);
  }
  const opts = {
    target: args[0],
    patchFile: args[1],
    targetSc: null,
    targetSelector: null,
    json: null,
  };
  for (let i = 2; i < args.length; i++) {
    switch (args[i]) {
      case "--target-sc": opts.targetSc = args[++i]; break;
      case "--target-selector": opts.targetSelector = args[++i]; break;
      case "--json": opts.json = args[++i]; break;
      default:
        console.error(`unknown arg: ${args[i]}`);
        process.exit(1);
    }
  }
  return opts;
}

function isUrl(s) {
  return /^https?:\/\//i.test(s);
}

async function resolveTarget(target) {
  if (isUrl(target)) {
    console.log(`[fetch] rendering ${target}…`);
    const { file, finalUrl } = await fetchPageToFile(target);
    console.log(`[fetch] saved to ${file}  (final URL: ${finalUrl})`);
    return file;
  }
  const abs = isAbsolute(target) ? target : resolve(process.cwd(), target);
  if (!existsSync(abs)) throw new Error(`local file not found: ${abs}`);
  return abs;
}

async function loadPatch(patchFile) {
  const abs = isAbsolute(patchFile) ? patchFile : resolve(process.cwd(), patchFile);
  const raw = JSON.parse(await readFile(abs, "utf8"));
  // Ground-truth wrapper: { fixture, sc, patch }
  if (raw.patch && raw.patch.patch_type) {
    return { patch: raw.patch, sc: raw.sc ?? null };
  }
  return { patch: raw, sc: null };
}

async function main() {
  const opts = parseArgs(process.argv);
  const htmlFile = await resolveTarget(opts.target);
  const { patch, sc: patchSc } = await loadPatch(opts.patchFile);

  console.log(`\n[validate-patch] target: ${opts.target}`);
  console.log(`[validate-patch] patch type: ${patch.patch_type}`);
  console.log(`[validate-patch] target_selector: ${patch.target_selector}`);

  // 1) Schema validation
  try {
    validatePatch(patch);
    console.log("[validate-patch] ✓ schema validation passed");
  } catch (e) {
    console.error("[validate-patch] ✗ schema validation FAILED:", e.message);
    process.exit(1);
  }

  // 2) Baseline detect to find the target violation by (sc, selector)
  console.log("\n[validate-patch] running baseline detection…");
  const baseline = await runDetection({ htmlFile });
  const targetSc = opts.targetSc ?? patchSc;
  const targetSelector = opts.targetSelector ?? patch.target_selector;
  const baselineFails = baseline.violations.filter((v) => v.result === "FAIL");
  console.log(`[validate-patch] baseline: ${baselineFails.length} total FAILs`);

  const targetMatch = baselineFails.find(
    (v) =>
      (!targetSc || v.sc === targetSc) &&
      (v.element?.selector === targetSelector || !targetSelector),
  );
  if (targetMatch) {
    console.log(`[validate-patch] target violation present in baseline: sc=${targetMatch.sc}`);
  } else {
    console.log(
      `[validate-patch] WARNING: no baseline FAIL matches sc=${targetSc} selector=${targetSelector}`,
    );
  }

  // 3) Apply patch + verify
  console.log("\n[validate-patch] applying patch and re-detecting…");
  const result = await verify({
    htmlFile,
    patch,
    targetSc,
    targetSelector,
    scFilter: targetSc,
  });

  console.log("\n=== VERIFICATION ===");
  console.log(`  status:           ${result.status}`);
  console.log(`  target resolved:  ${result.targetResolved}`);
  console.log(`  regression?       ${result.regressed} (new failures: ${result.newFailures.length})`);
  console.log(`  visual ssim:      ${result.ssim?.similarity?.toFixed?.(3) ?? "n/a"}`);
  console.log(`  baseline fails:   ${result.detection.baseline.violations.filter((v) => v.result === "FAIL").length}`);
  console.log(`  post fails:       ${result.detection.post.violations.filter((v) => v.result === "FAIL").length}`);

  if (result.newFailures.length > 0) {
    console.log("\n  new failures introduced:");
    for (const nf of result.newFailures) {
      console.log(`    - sc=${nf.sc} selector=${nf.element?.selector ?? "(page)"}: ${nf.reason}`);
    }
  }

  if (opts.json) {
    const path = isAbsolute(opts.json) ? opts.json : resolve(process.cwd(), opts.json);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(
      path,
      JSON.stringify(
        {
          target: opts.target,
          patch,
          targetSc,
          targetSelector,
          status: result.status,
          targetResolved: result.targetResolved,
          regressed: result.regressed,
          ssim: result.ssim,
          resolved: result.resolved.map((v) => ({
            sc: v.sc,
            selector: v.element?.selector ?? null,
          })),
          newFailures: result.newFailures.map((v) => ({
            sc: v.sc,
            selector: v.element?.selector ?? null,
            reason: v.reason,
          })),
        },
        null,
        2,
      ),
    );
    console.log(`\n[validate-patch] wrote ${path}`);
  }

  process.exit(result.status === "RESOLVED" ? 0 : 1);
}

main().catch((e) => {
  console.error("[validate-patch] FATAL:", e);
  process.exit(1);
});
