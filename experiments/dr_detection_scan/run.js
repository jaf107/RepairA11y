#!/usr/bin/env node
/**
 * D_r detection scan — runs NavA11y on all 27 included production sites
 * and counts violations per SC. Does NOT patch or verify (that requires
 * a local HTML copy). Output is used to characterize the production dataset.
 *
 * Usage:
 *   node experiments/dr_detection_scan/run.js
 *   node experiments/dr_detection_scan/run.js --timeout 60000   # ms per site
 */
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { runDetection } from "../../src/detector/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..", "..");

const SCS = ["2.4.7", "2.4.11", "2.4.12", "2.4.13"];

function parseArgs(argv) {
  const out = { timeout: 90000 };
  const a = argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    if (a[i] === "--timeout") out.timeout = parseInt(a[++i], 10);
  }
  return out;
}

async function loadSites() {
  const raw = await readFile(join(repoRoot, "nava11y/evaluation/dataset.json"), "utf8");
  const d = JSON.parse(raw);
  const sites = Array.isArray(d) ? d : d.sites ?? [];
  return sites.filter((s) => s.include !== false);
}

async function main() {
  const opts = parseArgs(process.argv);
  const sites = await loadSites();
  console.log(`[D_r scan] ${sites.length} sites`);

  const results = [];
  let siteIdx = 0;
  for (const site of sites) {
    siteIdx++;
    const url = site.url;
    console.log(`[${siteIdx}/${sites.length}] ${url}`);
    const t0 = Date.now();
    try {
      const det = await runDetection({ url });
      const fails = det.violations.filter((v) => v.result === "FAIL");
      const bySc = {};
      for (const sc of SCS) {
        bySc[sc] = fails.filter((v) => v.sc === sc).length;
      }
      const elapsed = Date.now() - t0;
      results.push({ url, status: "ok", totalFails: fails.length, bySc, ms: elapsed });
      console.log(
        `  → ${fails.length} FAILs (${SCS.map((sc) => `${sc}:${bySc[sc]}`).join(" ")}) in ${(elapsed / 1000).toFixed(1)}s`,
      );
    } catch (e) {
      results.push({ url, status: "error", error: e.message, ms: Date.now() - t0 });
      console.log(`  ERROR: ${e.message.slice(0, 100)}`);
    }
  }

  // Aggregate
  const ok = results.filter((r) => r.status === "ok");
  const bySc = {};
  for (const sc of SCS) {
    const counts = ok.map((r) => r.bySc[sc] ?? 0);
    bySc[sc] = {
      sitesAffected: counts.filter((n) => n > 0).length,
      totalViolations: counts.reduce((a, b) => a + b, 0),
      mean: counts.length ? (counts.reduce((a, b) => a + b, 0) / counts.length).toFixed(2) : 0,
    };
  }

  const summary = {
    scanned: results.length,
    succeeded: ok.length,
    failed: results.length - ok.length,
    bySc,
  };

  const outDir = join(__dirname, "results");
  await mkdir(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonPath = join(outDir, `scan-${stamp}.json`);
  const mdPath = join(outDir, `scan-${stamp}.md`);
  await writeFile(jsonPath, JSON.stringify({ opts, summary, results }, null, 2));
  await writeFile(mdPath, renderMarkdown(summary, results));
  console.log(`\n[D_r scan] wrote ${jsonPath}`);
  printSummary(summary);
}

function renderMarkdown(summary, results) {
  const lines = [];
  lines.push("# D_r Detection Scan");
  lines.push(`- generated: ${new Date().toISOString()}`);
  lines.push(`- sites scanned: ${summary.scanned} (${summary.succeeded} succeeded, ${summary.failed} errors)`);
  lines.push("");
  lines.push("## Violations by SC");
  lines.push("| SC | Sites affected | Total violations | Mean per site |");
  lines.push("|---|---|---|---|");
  for (const sc of Object.keys(summary.bySc).sort()) {
    const s = summary.bySc[sc];
    lines.push(`| ${sc} | ${s.sitesAffected} | ${s.totalViolations} | ${s.mean} |`);
  }
  lines.push("");
  lines.push("## Per-site results");
  lines.push("| Site | Status | Total FAILs | 2.4.7 | 2.4.11 | 2.4.12 | 2.4.13 |");
  lines.push("|---|---|---|---|---|---|---|");
  for (const r of results) {
    if (r.status === "ok") {
      lines.push(
        `| ${r.url} | ok | ${r.totalFails} | ${r.bySc["2.4.7"]} | ${r.bySc["2.4.11"]} | ${r.bySc["2.4.12"]} | ${r.bySc["2.4.13"]} |`,
      );
    } else {
      lines.push(`| ${r.url} | error | — | — | — | — | — |`);
    }
  }
  return lines.join("\n");
}

function printSummary(summary) {
  console.log("\n=== D_r Violation Summary ===");
  for (const sc of Object.keys(summary.bySc).sort()) {
    const s = summary.bySc[sc];
    console.log(`SC ${sc}: ${s.sitesAffected}/${summary.succeeded} sites affected, ${s.totalViolations} total violations`);
  }
}

main().catch((e) => {
  console.error("[D_r scan] FATAL:", e);
  process.exit(1);
});
