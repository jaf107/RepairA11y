#!/usr/bin/env node
/**
 * RQ-1 Evaluation Script
 *
 * Runs NavA11y against the GDS accessibility-tool-audit test cases (expanded dataset)
 * and computes Precision, Recall, F1, and Accuracy.
 *
 * Usage:
 *   node evaluation/run-gds-evaluation.mjs [--gds-path <path>]
 *
 * Options:
 *   --gds-path  Path to the accessibility-tool-audit repo
 *               Default: ../accessibility-tool-audit (relative to this repo)
 *   --dry-run   Print planned runs without executing
 */

import { run } from "../explorer/runner.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");

// ============================================================
// GROUND TRUTH DEFINITION
// Each test case defines: file path, targeted SCs, and expected per-SC verdicts
// ============================================================

const GROUND_TRUTH = [
  // ── Original GDS tests (Phase 1) ──
  {
    id: 1,
    name: "Keyboard focus is not indicated visually",
    file: "tests/keyboard-access-keyboard-focus-is-not-indicated-visually.html",
    expected: { "2.4.7": "FAIL" },
    wcagRef: "G149, G195",
    category: "original",
  },
  {
    id: 2,
    name: "Focus not visible (border regression)",
    file: "tests/colour-and-contrast-focus-not-visible.html",
    expected: { "2.4.7": "FAIL" },
    wcagRef: "F78",
    category: "original",
  },
  {
    id: 3,
    name: "Focus order in wrong order (CSS float)",
    file: "tests/keyboard-access-focus-order-in-wrong-order.html",
    expected: { "2.4.3": "FAIL" },
    wcagRef: "C27",
    category: "original",
  },
  {
    id: 4,
    name: "Tabindex greater than 0",
    file: "tests/keyboard-access-tabindex-greater-than-0.html",
    expected: { "2.4.3": "FAIL" },
    wcagRef: "F44",
    category: "original",
  },
  {
    id: 5,
    name: "Keyboard trap",
    file: "example-pages/keyboardtrap.html",
    expected: { "2.4.3": "FAIL" },
    wcagRef: "F55",
    category: "original",
  },
  {
    id: 6,
    name: "Non-focusable element with tabindex=0 (TN)",
    file: "tests/keyboard-access-keyboard-focus-assigned-to-a-non-focusable-element-using-tabindex0.html",
    expected: { "2.4.7": "PASS" },
    wcagRef: "best-practice",
    category: "original",
  },

  // ── New contributed tests: SC 2.4.7 Focus Visible (PASS cases) ──
  {
    id: 7,
    name: "Focus visible using box shadow",
    file: "tests/focus-visible-using-box-shadow.html",
    expected: { "2.4.7": "PASS" },
    wcagRef: "G195",
    category: "contributed",
  },
  {
    id: 8,
    name: "Focus visible using background colour change",
    file: "tests/focus-visible-using-background-colour-change.html",
    expected: { "2.4.7": "PASS" },
    wcagRef: "G195",
    category: "contributed",
  },
  {
    id: 9,
    name: "Focus visible using text decoration",
    file: "tests/focus-visible-using-text-decoration.html",
    expected: { "2.4.7": "PASS" },
    wcagRef: "G195",
    category: "contributed",
  },
  {
    id: 10,
    name: "Focus visible using border increase",
    file: "tests/focus-visible-using-border-increase.html",
    expected: { "2.4.7": "PASS" },
    wcagRef: "G195",
    category: "contributed",
  },

  // ── New contributed tests: SC 2.4.3 Focus Order ──
  {
    id: 11,
    name: "Focus order with skip link (positive tabindex)",
    file: "tests/focus-order-correct-with-skip-link.html",
    expected: { "2.4.3": "FAIL" },
    wcagRef: "G1, G124, F44",
    category: "contributed",
  },
  {
    id: 12,
    name: "Focus order matches visual order",
    file: "tests/focus-order-matches-visual-order.html",
    expected: { "2.4.3": "PASS" },
    wcagRef: "C27, G59",
    category: "contributed",
  },

  // ── New contributed tests: SC 2.4.13 Focus Appearance (AAA) ──
  {
    id: 13,
    name: "Focus appearance — outline insufficient contrast",
    file: "tests/focus-appearance-outline-insufficient-contrast.html",
    expected: { "2.4.7": "PASS", "2.4.13": "FAIL" },
    wcagRef: "C40",
    category: "contributed",
  },
  {
    id: 14,
    name: "Focus appearance — background sufficient contrast",
    file: "tests/focus-appearance-background-sufficient-contrast.html",
    expected: { "2.4.7": "PASS", "2.4.13": "PASS" },
    wcagRef: "C41",
    category: "contributed",
  },
  {
    id: 15,
    name: "Focus appearance — border sufficient width and contrast",
    file: "tests/focus-appearance-border-sufficient-width-and-contrast.html",
    expected: { "2.4.7": "PASS", "2.4.13": "PASS" },
    wcagRef: "C40",
    category: "contributed",
  },

  // ── New contributed tests: SC 2.4.11/2.4.12 Focus Not Obscured ──
  {
    id: 16,
    name: "Focus obscured by fixed footer",
    file: "tests/focus-obscured-by-fixed-footer.html",
    expected: { "2.4.11": "FAIL", "2.4.12": "FAIL" },
    wcagRef: "F110, C43",
    category: "contributed",
  },
  {
    id: 17,
    name: "Focus obscured by cookie banner",
    file: "tests/focus-obscured-by-cookie-banner.html",
    expected: { "2.4.11": "FAIL", "2.4.12": "FAIL" },
    wcagRef: "F110",
    category: "contributed",
  },

  // ── New contributed tests: SC 2.4.13 Focus Appearance (additional) ──
  {
    id: 18,
    name: "Focus appearance — outline insufficient width (1px)",
    file: "tests/focus-appearance-outline-insufficient-width.html",
    expected: { "2.4.7": "PASS", "2.4.13": "FAIL" },
    wcagRef: "C40",
    category: "contributed",
  },
  {
    id: 19,
    name: "Focus appearance — outline sufficient width and contrast",
    file: "tests/focus-appearance-outline-sufficient-width-and-contrast.html",
    expected: { "2.4.7": "PASS", "2.4.13": "PASS" },
    wcagRef: "C40",
    category: "contributed",
  },
  {
    id: 20,
    name: "Focus appearance — background insufficient contrast",
    file: "tests/focus-appearance-background-insufficient-contrast.html",
    expected: { "2.4.7": "PASS", "2.4.13": "FAIL" },
    wcagRef: "C41",
    category: "contributed",
  },
  {
    id: 21,
    name: "Focus appearance — border insufficient width (1px increase)",
    file: "tests/focus-appearance-border-insufficient-width.html",
    expected: { "2.4.7": "PASS", "2.4.13": "FAIL" },
    wcagRef: "C40",
    category: "contributed",
  },
  {
    id: 22,
    name: "Focus appearance — outline offset sufficient",
    file: "tests/focus-appearance-outline-offset-sufficient.html",
    expected: { "2.4.7": "PASS", "2.4.13": "PASS" },
    wcagRef: "C42",
    category: "contributed",
  },
];

// ============================================================
// RUNNER
// ============================================================

function parseArgs() {
  const args = process.argv.slice(2);
  let gdsPath = path.resolve(PROJECT_ROOT, "dataset", "focus-behavior-dataset");
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--gds-path" && args[i + 1]) {
      gdsPath = path.resolve(args[i + 1]);
      i++;
    }
    if (args[i] === "--dry-run") {
      dryRun = true;
    }
  }

  return { gdsPath, dryRun };
}

/**
 * Extract per-SC results from NavA11y's JSON report output.
 * The report is an array of check results, each with { sc, result }.
 * For page-level checks (2.4.3): one entry.
 * For element-level checks (2.4.7, 2.4.11, 2.4.12, 2.4.13): one per element.
 *   → We take the WORST result (any FAIL = overall FAIL for that SC).
 */
function extractSCResults(reportPath) {
  if (!fs.existsSync(reportPath)) return null;

  const results = JSON.parse(fs.readFileSync(reportPath, "utf-8"));
  const scResults = {};

  for (const entry of results) {
    const sc = entry.sc;
    const result = entry.result;
    if (!sc) continue;

    // For a given SC, if ANY element FAILs, the page-level verdict is FAIL
    if (!scResults[sc] || result === "FAIL") {
      scResults[sc] = result;
    }
  }

  return scResults;
}

/**
 * Derive the report directory name from a file URL.
 * Mirrors the sanitization in reporter/index.js:
 *   url.replace(/^https?:\/\//, '').replace(/[^a-z0-9]/gi, '_').toLowerCase()
 * For file:// URLs, the full path is sanitized.
 */
function getReportDirName(filePath) {
  // The runner receives file:///absolute/path.html
  const fileUrl = `file://${filePath}`;
  // reporter/index.js strips http(s):// but not file://, so the full URL is sanitized
  const sanitized = fileUrl
    .replace(/^https?:\/\//, "")
    .replace(/[^a-z0-9]/gi, "_")
    .toLowerCase();
  return sanitized;
}

// ============================================================
// METRIC COMPUTATION
// ============================================================

function computeMetrics(evaluationResults) {
  let TP = 0,
    TN = 0,
    FP = 0,
    FN = 0;
  const perSC = {};
  const details = [];

  for (const er of evaluationResults) {
    for (const [sc, expected] of Object.entries(er.expected)) {
      const actual = er.actual?.[sc] || "MISSING";

      if (!perSC[sc]) perSC[sc] = { TP: 0, TN: 0, FP: 0, FN: 0 };

      let verdict;
      if (expected === "FAIL" && actual === "FAIL") {
        verdict = "TP";
        TP++;
        perSC[sc].TP++;
      } else if (expected === "PASS" && actual === "PASS") {
        verdict = "TN";
        TN++;
        perSC[sc].TN++;
      } else if (expected === "PASS" && actual === "FAIL") {
        verdict = "FP";
        FP++;
        perSC[sc].FP++;
      } else if (expected === "FAIL" && actual === "PASS") {
        verdict = "FN";
        FN++;
        perSC[sc].FN++;
      } else {
        verdict = "ERROR";
      }

      details.push({
        id: er.id,
        name: er.name,
        sc,
        expected,
        actual,
        verdict,
        category: er.category,
      });
    }
  }

  const precision = TP + FP > 0 ? TP / (TP + FP) : 0;
  const recall = TP + FN > 0 ? TP / (TP + FN) : 0;
  const f1 =
    precision + recall > 0
      ? (2 * precision * recall) / (precision + recall)
      : 0;
  const accuracy = TP + TN + FP + FN > 0 ? (TP + TN) / (TP + TN + FP + FN) : 0;

  return { TP, TN, FP, FN, precision, recall, f1, accuracy, perSC, details };
}

// ============================================================
// OUTPUT
// ============================================================

function printReport(metrics, evaluationResults) {
  const sep = "═".repeat(72);

  console.log(`\n${sep}`);
  console.log("  RQ-1: NavA11y Recall on Known Violations (GDS Dataset)");
  console.log(sep);

  // ── Per-test results ──
  console.log(
    "\n┌─ Test Results ─────────────────────────────────────────────────┐\n",
  );

  for (const d of metrics.details) {
    const icon =
      d.verdict === "TP" || d.verdict === "TN"
        ? "✅"
        : d.verdict === "FP"
          ? "⚠️"
          : d.verdict === "FN"
            ? "❌"
            : "❓";
    const tag = d.category === "contributed" ? "[NEW]" : "[GDS]";
    console.log(
      `  ${icon} ${tag} #${d.id} ${d.name} | SC ${d.sc}: expected=${d.expected} actual=${d.actual} → ${d.verdict}`,
    );
  }

  // ── Confusion matrix ──
  console.log(
    "\n┌─ Confusion Matrix ─────────────────────────────────────────────┐\n",
  );
  console.log(`  True Positives  (TP): ${metrics.TP}`);
  console.log(`  True Negatives  (TN): ${metrics.TN}`);
  console.log(`  False Positives (FP): ${metrics.FP}`);
  console.log(`  False Negatives (FN): ${metrics.FN}`);

  // ── Overall metrics ──
  console.log(
    "\n┌─ Overall Metrics ──────────────────────────────────────────────┐\n",
  );
  console.log(`  Precision:  ${(metrics.precision * 100).toFixed(1)}%`);
  console.log(`  Recall:     ${(metrics.recall * 100).toFixed(1)}%`);
  console.log(`  F1 Score:   ${(metrics.f1 * 100).toFixed(1)}%`);
  console.log(`  Accuracy:   ${(metrics.accuracy * 100).toFixed(1)}%`);

  // ── Per-SC breakdown ──
  console.log(
    "\n┌─ Per-SC Breakdown ─────────────────────────────────────────────┐\n",
  );
  console.log("  SC       │  TP  TN  FP  FN  │  Precision  Recall  F1");
  console.log("  ─────────┼────────────────────┼───────────────────────────");

  for (const [sc, m] of Object.entries(metrics.perSC).sort()) {
    const p = m.TP + m.FP > 0 ? m.TP / (m.TP + m.FP) : 0;
    const r = m.TP + m.FN > 0 ? m.TP / (m.TP + m.FN) : 0;
    const f = p + r > 0 ? (2 * p * r) / (p + r) : 0;
    console.log(
      `  ${sc.padEnd(8)} │  ${String(m.TP).padStart(2)}  ${String(m.TN).padStart(2)}  ${String(m.FP).padStart(2)}  ${String(m.FN).padStart(2)}  │  ${(p * 100).toFixed(0).padStart(6)}%  ${(r * 100).toFixed(0).padStart(5)}%  ${(f * 100).toFixed(0).padStart(3)}%`,
    );
  }

  // ── Category breakdown ──
  console.log(
    "\n┌─ By Category ──────────────────────────────────────────────────┐\n",
  );

  for (const cat of ["original", "contributed"]) {
    const catDetails = metrics.details.filter((d) => d.category === cat);
    const tp = catDetails.filter((d) => d.verdict === "TP").length;
    const tn = catDetails.filter((d) => d.verdict === "TN").length;
    const fp = catDetails.filter((d) => d.verdict === "FP").length;
    const fn = catDetails.filter((d) => d.verdict === "FN").length;
    const p = tp + fp > 0 ? tp / (tp + fp) : 0;
    const r = tp + fn > 0 ? tp / (tp + fn) : 0;
    const f = p + r > 0 ? (2 * p * r) / (p + r) : 0;

    const label =
      cat === "original" ? "Original GDS (6 tests)" : "Contributed (12 tests)";
    console.log(`  ${label}`);
    console.log(`    TP=${tp} TN=${tn} FP=${fp} FN=${fn}`);
    console.log(
      `    Precision=${(p * 100).toFixed(1)}%  Recall=${(r * 100).toFixed(1)}%  F1=${(f * 100).toFixed(1)}%`,
    );
    console.log();
  }

  console.log(sep);
}

function saveResults(metrics, evaluationResults, outputPath) {
  const output = {
    timestamp: new Date().toISOString(),
    dataset: "GDS accessibility-tool-audit (expanded)",
    totalTests: evaluationResults.length,
    totalAssertions: metrics.details.length,
    metrics: {
      precision: metrics.precision,
      recall: metrics.recall,
      f1: metrics.f1,
      accuracy: metrics.accuracy,
      confusionMatrix: {
        TP: metrics.TP,
        TN: metrics.TN,
        FP: metrics.FP,
        FN: metrics.FN,
      },
    },
    perSC: metrics.perSC,
    details: metrics.details,
    groundTruth: GROUND_TRUTH,
  };
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`\n📄 Results saved to ${outputPath}`);
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  const { gdsPath, dryRun } = parseArgs();

  // Validate GDS repo path
  if (!fs.existsSync(gdsPath)) {
    console.error(`❌ GDS repo not found at: ${gdsPath}`);
    console.error(
      `   Use --gds-path to specify the location of accessibility-tool-audit`,
    );
    process.exit(1);
  }

  console.log("═".repeat(72));
  console.log("  RQ-1 Evaluation: Focus Behavior Dataset");
  console.log("═".repeat(72));
  console.log(`\n  Dataset: ${gdsPath}`);
  console.log(
    `  Test cases: ${GROUND_TRUTH.length} (${GROUND_TRUTH.filter((t) => t.category === "original").length} original + ${GROUND_TRUTH.filter((t) => t.category === "contributed").length} contributed)\n`,
  );

  if (dryRun) {
    console.log("  [DRY RUN] Would run:\n");
    for (const tc of GROUND_TRUTH) {
      const fullPath = path.join(gdsPath, tc.file);
      const exists = fs.existsSync(fullPath);
      console.log(`  ${exists ? "✅" : "❌"} #${tc.id} ${tc.name}`);
      console.log(`     ${fullPath}`);
      console.log(`     Expected: ${JSON.stringify(tc.expected)}\n`);
    }
    process.exit(0);
  }

  const evaluationResults = [];

  for (const tc of GROUND_TRUTH) {
    const fullPath = path.join(gdsPath, tc.file);

    if (!fs.existsSync(fullPath)) {
      console.error(`  ❌ File not found: ${fullPath}`);
      evaluationResults.push({ ...tc, actual: null, error: "File not found" });
      continue;
    }

    const fileUrl = `file://${fullPath}`;
    console.log(`\n  ▶ Running #${tc.id}: ${tc.name}...`);

    try {
      await run(fileUrl);

      // Find the report — derive dir name from the file:// URL using same
      // sanitization as reporter/index.js
      const reportDirName = getReportDirName(fullPath);
      const reportPath = path.join(
        PROJECT_ROOT,
        "reports",
        reportDirName,
        "results.json",
      );

      if (fs.existsSync(reportPath)) {
        const actual = extractSCResults(reportPath);
        evaluationResults.push({ ...tc, actual });
        console.log(`    ✅ Results: ${JSON.stringify(actual)}`);
      } else {
        // Fallback: scan reports/ for any dir containing the test filename
        const basename = path.basename(fullPath, ".html").toLowerCase();
        const reportsDir = path.join(PROJECT_ROOT, "reports");
        const candidates = fs
          .readdirSync(reportsDir)
          .filter((d) => d.toLowerCase().includes(basename.replace(/-/g, "_")));

        if (candidates.length === 1) {
          const fallbackPath = path.join(
            reportsDir,
            candidates[0],
            "results.json",
          );
          if (fs.existsSync(fallbackPath)) {
            const actual = extractSCResults(fallbackPath);
            evaluationResults.push({ ...tc, actual });
            console.log(`    ✅ Results (fallback): ${JSON.stringify(actual)}`);
          } else {
            console.error(
              `    ⚠ Report dir found but no results.json: ${candidates[0]}`,
            );
            evaluationResults.push({
              ...tc,
              actual: null,
              error: "No results.json",
            });
          }
        } else {
          console.error(`    ⚠ Report not found. Tried: ${reportDirName}`);
          evaluationResults.push({
            ...tc,
            actual: null,
            error: "Report not found",
          });
        }
      }
    } catch (error) {
      console.error(`    ❌ Error: ${error.message}`);
      evaluationResults.push({ ...tc, actual: null, error: error.message });
    }
  }

  // Compute metrics
  const metrics = computeMetrics(evaluationResults);

  // Print report
  printReport(metrics, evaluationResults);

  // Save JSON results
  const resultsDir = path.join(PROJECT_ROOT, "evaluation", "results");
  fs.mkdirSync(resultsDir, { recursive: true });
  const outputPath = path.join(resultsDir, "rq1-results.json");
  saveResults(metrics, evaluationResults, outputPath);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
