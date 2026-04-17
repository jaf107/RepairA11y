#!/usr/bin/env node
/**
 * Run NavA11y against all D_r benchmark websites sequentially.
 * Shows progress and timing. Skips sites that fail gracefully.
 *
 * Features:
 *   - Auto-retries sites where violation count is zero (suspected silent failure)
 *   - Writes benchmark-results/review-cases.csv for manual validation
 *   - After manual reruns, call `node evaluation/generate-benchmark-summary.mjs`
 *     to sync the summary files with the updated reports.
 *
 * Usage: node evaluation/run-all-benchmark.mjs
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { generateBenchmarkSummary } from "./generate-benchmark-summary.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");

// Read config to get headless setting
const configPath = path.join(PROJECT_ROOT, "config", "default.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
const headless = config.browser?.headless ?? false;

// D_r — canonical benchmark dataset (excludes sites with automated access barriers)
const dataset = JSON.parse(
  fs.readFileSync(path.join(__dirname, "dataset.json"), "utf-8"),
);
const URLS = dataset.sites.filter((s) => s.include).map((s) => s.url);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sanitizeUrl(url) {
  return url
    .replace(/^https?:\/\//, "")
    .replace(/[^a-z0-9]/gi, "_")
    .toLowerCase();
}

function runSite(url, label) {
  const start = Date.now();
  const sanitizedUrl = sanitizeUrl(url);
  const reportPath = `reports/${sanitizedUrl}`;
  const reportJson = `${reportPath}/results.json`;

  try {
    const output = execSync(
      `node ${path.join(PROJECT_ROOT, "run-check.js")} "${url}"`,
      {
        cwd: PROJECT_ROOT,
        timeout: 180000, // 3 min per site
        stdio: ["pipe", "pipe", "pipe"],
        encoding: "utf-8",
      },
    );

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    // Extract summary line from output
    const summaryLines = output
      .split("\n")
      .filter((l) => l.includes("failures /"));
    const failCount = summaryLines.reduce((sum, l) => {
      const m = l.match(/(\d+) failures/);
      return sum + (m ? parseInt(m[1]) : 0);
    }, 0);

    // Read results.json for detailed stats
    let violationsBySc = {};
    let elementChecks = 0;
    try {
      const resultsPath = path.join(PROJECT_ROOT, reportJson);
      if (fs.existsSync(resultsPath)) {
        const resultsData = JSON.parse(fs.readFileSync(resultsPath, "utf-8"));
        const failures = resultsData.filter((r) => r.result === "FAIL");
        elementChecks = resultsData.filter(
          (r) => r.checkType === "element-level",
        ).length;
        violationsBySc = failures.reduce((acc, f) => {
          const sc = f.sc || f.scId || "unknown";
          acc[sc] = (acc[sc] || 0) + 1;
          return acc;
        }, {});
      }
    } catch (_) {
      // If can't read JSON, just use failCount
    }

    console.log(`${label} Done in ${elapsed}s — ${failCount} total failures`);
    return {
      url,
      status: elementChecks === 0 ? "blocked" : "ok",
      elapsed: parseFloat(elapsed),
      failCount,
      elementChecks,
      violationsBySc,
      reportPath,
      reportHtml: `${reportPath}/index.html`,
      reportJson,
    };
  } catch (err) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    const msg = err.message?.split("\n")[0] || "unknown error";
    console.log(`${label} FAILED in ${elapsed}s — ${msg}`);
    return {
      url,
      status: "error",
      elapsed: parseFloat(elapsed),
      error: msg,
      reportPath,
      reportHtml: null,
      reportJson: null,
    };
  }
}

function writeReviewCsv(results) {
  const benchmarkDir = path.join(PROJECT_ROOT, "benchmark-results");
  if (!fs.existsSync(benchmarkDir)) {
    fs.mkdirSync(benchmarkDir, { recursive: true });
  }

  const reviewCases = results.filter(
    (r) => r.status === "error" || r.status === "blocked" || r.failCount === 0,
  );

  if (reviewCases.length === 0) {
    console.log("  No review cases — all sites returned violations.");
    return;
  }

  const header = "url,status,failCount,reason\n";
  const rows = reviewCases
    .map((r) => {
      let reason;
      if (r.status === "error") reason = r.error?.replace(/"/g, '""') || "unknown error";
      else if (r.status === "blocked") reason = "No element-level checks ran (page possibly blocked)";
      else reason = "Zero violations — possible silent failure";
      return `"${r.url}","${r.status}",${r.failCount ?? "N/A"},"${reason}"`;
    })
    .join("\n");

  const csvPath = path.join(benchmarkDir, "review-cases.csv");
  fs.writeFileSync(csvPath, header + rows);
  console.log(`  Review cases written to: benchmark-results/review-cases.csv (${reviewCases.length} sites)`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

const total = URLS.length;
const results = [];
const startAll = Date.now();

console.log("=".repeat(60));
console.log(`  NavA11y Benchmark Run — ${total} websites`);
console.log(`  headless: ${headless}`);
console.log("=".repeat(60));
console.log();

// ── Pass 1: run all sites ────────────────────────────────────────────────────
for (let i = 0; i < total; i++) {
  const url = URLS[i];
  const label = `[${i + 1}/${total}]`;
  console.log(`${label} Starting: ${url}`);
  results.push(runSite(url, label));
  console.log();
}

// ── Pass 2: auto-retry suspected silent failures ─────────────────────────────
const retryTargets = results.filter(
  (r) => r.status !== "error" && r.failCount === 0,
);
if (retryTargets.length > 0) {
  console.log("=".repeat(60));
  console.log(`  Auto-retry: ${retryTargets.length} sites with zero violations`);
  console.log("=".repeat(60));
  console.log();

  for (let i = 0; i < retryTargets.length; i++) {
    const prev = retryTargets[i];
    const label = `[retry ${i + 1}/${retryTargets.length}]`;
    console.log(`${label} Retrying: ${prev.url}`);
    const retried = runSite(prev.url, label);

    // Replace the original result with the retry result
    const idx = results.findIndex((r) => r.url === prev.url);
    results[idx] = retried;
    console.log();
  }
}

// ── Summary ──────────────────────────────────────────────────────────────────
const totalElapsed = ((Date.now() - startAll) / 1000 / 60).toFixed(1);
console.log("=".repeat(60));
console.log(`  COMPLETE — ${total} sites in ${totalElapsed} minutes`);
console.log("=".repeat(60));
console.log();

const ok = results.filter((r) => r.status === "ok");
const blocked = results.filter((r) => r.status === "blocked");
const failed = results.filter((r) => r.status === "error");
const zeroViolations = ok.filter((r) => r.failCount === 0);

console.log(`  Successful: ${ok.length}`);
console.log(`  Blocked:    ${blocked.length}`);
console.log(`  Failed:     ${failed.length}`);
if (failed.length > 0) {
  console.log("  Failed sites:");
  failed.forEach((f) => console.log(`    - ${f.url}: ${f.error}`));
}
if (zeroViolations.length > 0) {
  console.log(`  Zero violations (review): ${zeroViolations.length}`);
  zeroViolations.forEach((r) => console.log(`    - ${r.url}`));
}
console.log();

// Write review-cases.csv for manual validation
writeReviewCsv(results);
console.log();

// Generate consolidated summary files using shared utility
generateBenchmarkSummary({ headless });

console.log(
  "\nTo manually rerun a site:\n" +
    '  node run-check.js "https://www.example.com"\n' +
    "Then sync the summary:\n" +
    "  node evaluation/generate-benchmark-summary.mjs\n",
);
