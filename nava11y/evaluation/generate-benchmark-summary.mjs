#!/usr/bin/env node
/**
 * Generate benchmark summary files from existing reports
 *
 * Scans reports/ directory and generates:
 * - benchmark-results/summary.json
 * - benchmark-results/summary.csv
 * - benchmark-results/index.html
 *
 * Can be used standalone or imported by run-all-benchmark.mjs
 *
 * Usage: node evaluation/generate-benchmark-summary.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");

/**
 * Extract URL from sanitized directory name
 */
function extractUrl(dirName) {
  // Convert www_ebay_com → https://www.ebay.com
  const host = dirName.replace(/_/g, ".");
  return `https://${host}`;
}

/**
 * Generate summary files from all reports in reports/ directory
 */
export function generateBenchmarkSummary(config = {}) {
  const reportsDir = path.join(PROJECT_ROOT, "reports");
  const benchmarkDir = path.join(PROJECT_ROOT, "benchmark-results");

  if (!fs.existsSync(reportsDir)) {
    console.error("❌ reports/ directory not found");
    return { success: false, results: [] };
  }

  // Scan all report directories (exclude local fixture reports)
  const reportDirs = fs.readdirSync(reportsDir).filter((d) => {
    if (d.startsWith("file_")) return false; // skip local fixture reports
    const fullPath = path.join(reportsDir, d);
    return (
      fs.statSync(fullPath).isDirectory() &&
      fs.existsSync(path.join(fullPath, "results.json"))
    );
  });

  if (reportDirs.length === 0) {
    console.error("❌ No valid reports found");
    return { success: false, results: [] };
  }

  console.log(`📊 Found ${reportDirs.length} reports, generating summary...`);

  const results = [];
  const startTime = Date.now();

  // Process each report
  for (const dirName of reportDirs) {
    const url = extractUrl(dirName);
    const reportPath = `reports/${dirName}`;
    const reportHtml = `${reportPath}/index.html`;
    const reportJson = `${reportPath}/results.json`;

    try {
      const resultsPath = path.join(PROJECT_ROOT, reportJson);
      const resultsData = JSON.parse(fs.readFileSync(resultsPath, "utf-8"));

      // Count failures and element-level checks
      const failures = resultsData.filter((r) => r.result === "FAIL");
      const elementChecks = resultsData.filter(
        (r) => r.checkType === "element-level",
      ).length;

      // Count violations by SC
      const violationsBySc = failures.reduce((acc, f) => {
        const sc = f.sc || f.scId || "unknown";
        acc[sc] = (acc[sc] || 0) + 1;
        return acc;
      }, {});

      results.push({
        url,
        status: elementChecks === 0 ? "blocked" : "ok",
        elapsed: 0, // Not available from static scan
        failCount: failures.length,
        elementChecks,
        violationsBySc,
        reportPath,
        reportHtml,
        reportJson,
      });
    } catch (error) {
      console.warn(`⚠️  Error reading ${reportJson}: ${error.message}`);
      results.push({
        url,
        status: "error",
        elapsed: 0,
        error: error.message,
        reportPath,
        reportHtml: null,
        reportJson: null,
      });
    }
  }

  // Create benchmark-results directory
  if (!fs.existsSync(benchmarkDir)) {
    fs.mkdirSync(benchmarkDir, { recursive: true });
  }

  const totalElapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  const ok = results.filter((r) => r.status === "ok");
  const failed = results.filter((r) => r.status === "error");
  const headless = config.headless ?? false;

  // 1. Save detailed JSON
  const summaryJson = {
    timestamp: new Date().toISOString(),
    config: { headless },
    totalSites: results.length,
    successful: ok.length,
    failed: failed.length,
    totalElapsedMinutes: parseFloat(totalElapsed),
    results,
  };

  fs.writeFileSync(
    path.join(benchmarkDir, "summary.json"),
    JSON.stringify(summaryJson, null, 2),
  );

  // 2. Save CSV
  const csvHeader =
    "URL,Status,Elapsed (s),Total Violations,2.4.3,2.4.7,2.4.11,2.4.12,2.4.13,Report HTML\n";
  const csvRows = results
    .map((r) => {
      if (r.status === "error") {
        return `"${r.url}",ERROR,${r.elapsed},N/A,,,,,,"${r.error}"`;
      }
      const sc243 = r.violationsBySc?.["2.4.3"] || 0;
      const sc247 = r.violationsBySc?.["2.4.7"] || 0;
      const sc2411 = r.violationsBySc?.["2.4.11"] || 0;
      const sc2412 = r.violationsBySc?.["2.4.12"] || 0;
      const sc2413 = r.violationsBySc?.["2.4.13"] || 0;
      const statusLabel = r.status === "blocked" ? "BLOCKED" : "OK";
      return `"${r.url}",${statusLabel},${r.elapsed},${r.failCount},${sc243},${sc247},${sc2411},${sc2412},${sc2413},"${r.reportHtml}"`;
    })
    .join("\n");

  fs.writeFileSync(path.join(benchmarkDir, "summary.csv"), csvHeader + csvRows);

  // 3. Save HTML index
  const htmlIndex = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NavA11y Benchmark Results</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 1200px; margin: 2rem auto; padding: 0 1rem; }
    h1 { color: #1976d2; }
    .meta { color: #666; margin-bottom: 2rem; }
    table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
    th, td { padding: 0.75rem; text-align: left; border-bottom: 1px solid #ddd; }
    th { background: #f5f5f5; font-weight: 600; }
    tr:hover { background: #fafafa; }
    .status-ok { color: #2e7d32; font-weight: 600; }
    .status-error { color: #c62828; font-weight: 600; }
    a { color: #1976d2; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .violations { font-weight: 600; }
    .violations.high { color: #c62828; }
    .violations.medium { color: #f57c00; }
    .violations.low { color: #fbc02d; }
    .violations.zero { color: #2e7d32; }
  </style>
</head>
<body>
  <h1>NavA11y Benchmark Results — ${results.length} Websites</h1>
  <div class="meta">
    <p><strong>Date:</strong> ${new Date().toLocaleString()}</p>
    <p><strong>Headless:</strong> ${headless}</p>
    <p><strong>Successful:</strong> ${ok.length} | <strong>Failed:</strong> ${failed.length}</p>
  </div>
  
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Website</th>
        <th>Status</th>
        <th>Total Violations</th>
        <th>2.4.3</th>
        <th>2.4.7</th>
        <th>2.4.11</th>
        <th>2.4.12</th>
        <th>2.4.13</th>
        <th>Report</th>
      </tr>
    </thead>
    <tbody>
${results
  .map((r, i) => {
    if (r.status === "error") {
      return `      <tr>
        <td>${i + 1}</td>
        <td>${r.url}</td>
        <td class="status-error">ERROR</td>
        <td colspan="7">${r.error}</td>
      </tr>`;
    }

    const sc243 = r.violationsBySc?.["2.4.3"] || 0;
    const sc247 = r.violationsBySc?.["2.4.7"] || 0;
    const sc2411 = r.violationsBySc?.["2.4.11"] || 0;
    const sc2412 = r.violationsBySc?.["2.4.12"] || 0;
    const sc2413 = r.violationsBySc?.["2.4.13"] || 0;

    let violClass = "zero";
    if (r.failCount > 0) violClass = "low";
    if (r.failCount > 10) violClass = "medium";
    if (r.failCount > 50) violClass = "high";

    return `      <tr>
        <td>${i + 1}</td>
        <td>${r.url}</td>
        <td class="status-ok">OK</td>
        <td class="violations ${violClass}">${r.failCount}</td>
        <td>${sc243}</td>
        <td>${sc247}</td>
        <td>${sc2411}</td>
        <td>${sc2412}</td>
        <td>${sc2413}</td>
        <td><a href="../${r.reportHtml}" target="_blank">View Report</a></td>
      </tr>`;
  })
  .join("\n")}
    </tbody>
  </table>
</body>
</html>`;

  fs.writeFileSync(path.join(benchmarkDir, "index.html"), htmlIndex);

  console.log(`✅ Saved summary files to benchmark-results/`);
  console.log(`   - summary.json (${ok.length} OK, ${failed.length} failed)`);
  console.log(`   - summary.csv`);
  console.log(`   - index.html`);

  return { success: true, results, ok, failed };
}

// If run directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  // Read config if exists
  const configPath = path.join(PROJECT_ROOT, "config", "default.json");
  let config = {};
  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  }

  const result = generateBenchmarkSummary({
    headless: config.browser?.headless,
  });

  if (result.success) {
    console.log();
    console.log(
      'Next: run "node evaluation/select-precision-sites.mjs" to select sites for manual audit',
    );
  } else {
    process.exit(1);
  }
}
