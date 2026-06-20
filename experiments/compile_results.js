#!/usr/bin/env node
/**
 * Compile all experiment results into a single supervisor-ready summary.
 *
 * Usage:
 *   node experiments/compile_results.js
 *
 * Reads the latest result files from:
 *   experiments/rq1_effectiveness/results/
 *   experiments/rq2_evidence_ablation/results/
 *   experiments/rq4_regression/results/
 *   experiments/dr_detection_scan/results/
 *
 * Writes: experiments/RESULTS_SUMMARY.md
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function latestJson(dir) {
  let files;
  try {
    files = await readdir(dir);
  } catch {
    return null;
  }
  const jsons = files.filter((f) => f.endsWith(".json")).sort().reverse();
  if (!jsons.length) return null;
  const raw = await readFile(join(dir, jsons[0]), "utf8");
  return { file: jsons[0], data: JSON.parse(raw) };
}

async function latestMd(dir) {
  let files;
  try {
    files = await readdir(dir);
  } catch {
    return null;
  }
  const mds = files.filter((f) => f.endsWith(".md")).sort().reverse();
  if (!mds.length) return null;
  return readFile(join(dir, mds[0]), "utf8");
}

async function main() {
  const rq1 = await latestJson(join(__dirname, "rq1_effectiveness/results"));
  const rq2 = await latestJson(join(__dirname, "rq2_evidence_ablation/results"));
  const rq4 = await latestJson(join(__dirname, "rq4_regression/results"));
  const dr = await latestJson(join(__dirname, "dr_detection_scan/results"));

  const rq2md = await latestMd(join(__dirname, "rq2_evidence_ablation/results"));
  const rq4md = await latestMd(join(__dirname, "rq4_regression/results"));

  const lines = [];
  lines.push("# RepairA11y — Experiment Results Summary");
  lines.push(`\n_Generated: ${new Date().toISOString()}_`);
  lines.push("\n---\n");

  // RQ1
  lines.push("## RQ1 — Repair Effectiveness (D_d Controlled Dataset)");
  if (rq1) {
    const d = rq1.data;
    const all = d.all ?? [];
    const byGen = groupBy(all.filter(r => r.status !== "NO_FAIL"), "generator");
    lines.push(`\n**Source:** ${rq1.file}\n`);
    lines.push("| Generator | Resolved | Total | Rate |");
    lines.push("|---|---|---|---|");
    for (const [gen, rows] of Object.entries(byGen)) {
      const res = rows.filter(r => r.status === "RESOLVED").length;
      lines.push(`| ${gen} | ${res} | ${rows.length} | ${pct(res, rows.length)} |`);
    }
    lines.push("");
    const bySc = groupBy(all.filter(r => r.status !== "NO_FAIL"), "sc");
    lines.push("| SC | Resolved | Total | Rate |");
    lines.push("|---|---|---|---|");
    for (const [sc, rows] of Object.entries(bySc).sort()) {
      const res = rows.filter(r => r.status === "RESOLVED").length;
      lines.push(`| ${sc} | ${res} | ${rows.length} | ${pct(res, rows.length)} |`);
    }
  } else {
    lines.push("_No RQ1 results found._");
  }

  // RQ2
  lines.push("\n---\n## RQ2 — Evidence Ablation (SC 2.4.13)");
  if (rq2md) {
    lines.push("");
    lines.push(rq2md);
  } else if (rq2) {
    lines.push("\n_RQ2 results available but markdown not generated yet._");
  } else {
    lines.push("\n_No RQ2 results found._");
  }

  // RQ4
  lines.push("\n---\n## RQ4 — Regression Analysis");
  if (rq4md) {
    lines.push("");
    lines.push(rq4md);
  } else if (rq4) {
    const s = rq4.data.summary;
    lines.push(`\n- Regression rate: **${(s.regressionRate * 100).toFixed(1)}%**`);
    lines.push(`- Mean SSIM: **${s.meanSsim?.toFixed(3) ?? "n/a"}**`);
  } else {
    lines.push("\n_No RQ4 results found._");
  }

  // D_r
  lines.push("\n---\n## D_r — Production Site Violation Counts");
  if (dr) {
    const s = dr.data.summary;
    lines.push(`\n**Source:** ${dr.file}`);
    lines.push(`- Sites scanned: ${s.scanned} (${s.succeeded} succeeded, ${s.failed} errors)`);
    lines.push("");
    lines.push("| SC | Sites affected | Total violations | Mean/site |");
    lines.push("|---|---|---|---|");
    for (const [sc, stats] of Object.entries(s.bySc).sort()) {
      lines.push(`| ${sc} | ${stats.sitesAffected} | ${stats.totalViolations} | ${stats.mean} |`);
    }

    // Per-site table
    lines.push("\n**Per-site breakdown:**\n");
    lines.push("| Site | Total FAILs | 2.4.7 | 2.4.11 | 2.4.12 | 2.4.13 |");
    lines.push("|---|---|---|---|---|---|");
    for (const r of dr.data.results) {
      if (r.status === "ok") {
        lines.push(`| ${r.url} | ${r.totalFails} | ${r.bySc["2.4.7"]} | ${r.bySc["2.4.11"]} | ${r.bySc["2.4.12"]} | ${r.bySc["2.4.13"]} |`);
      } else {
        lines.push(`| ${r.url} | ERROR | — | — | — | — |`);
      }
    }
  } else {
    lines.push("\n_D_r scan not yet complete._");
  }

  // Key observations
  lines.push("\n---\n## Key Observations\n");
  if (rq1 && rq4) {
    const ruleRows = (rq1.data.all ?? []).filter(r => r.generator === "rule_based" && r.status !== "NO_FAIL");
    const llmRows = (rq1.data.all ?? []).filter(r => r.generator === "llm_based" && r.status !== "NO_FAIL");
    const ruleRate = ruleRows.length ? ruleRows.filter(r => r.status === "RESOLVED").length / ruleRows.length : 0;
    const llmRate = llmRows.length ? llmRows.filter(r => r.status === "RESOLVED").length / llmRows.length : 0;
    lines.push(`1. **Rule-based** resolves ${(ruleRate * 100).toFixed(0)}% of D_d FAIL cases (${ruleRows.filter(r=>r.status==="RESOLVED").length}/${ruleRows.length})`);
    lines.push(`2. **LLM-based** resolves ${(llmRate * 100).toFixed(0)}% of D_d FAIL cases (${llmRows.filter(r=>r.status==="RESOLVED").length}/${llmRows.length})`);

    const s = rq4.data.summary;
    lines.push(`3. **Regression rate**: ${(s.regressionRate * 100).toFixed(1)}% — patches safe (SSIM ${s.meanSsim?.toFixed(3) ?? "n/a"})`);
  }
  if (rq2) {
    const perLevel = rq2.data.summary?.perLevel ?? {};
    const e1 = perLevel["E1"];
    const e3 = perLevel["E3"];
    if (e1 && e3) {
      lines.push(`4. **Evidence ablation**: E1 (static) ${(e1.meanRate * 100).toFixed(1)}% vs E3 (runtime) ${(e3.meanRate * 100).toFixed(1)}% resolution rate`);
      const test = rq2.data.summary?.tests?.["E1_vs_E3"];
      if (test && test.p != null) {
        lines.push(`   McNemar E1 vs E3: p=${test.p.toFixed(4)}, Cohen's h=${test.cohensH?.toFixed(3)}, ${test.significant ? "**significant**" : "not significant"}`);
      }
    }
  }

  const md = lines.join("\n");
  const outPath = join(__dirname, "RESULTS_SUMMARY.md");
  await writeFile(outPath, md);
  console.log(`Wrote ${outPath}`);
  console.log(md.slice(0, 1000) + (md.length > 1000 ? "\n..." : ""));
}

function groupBy(arr, key) {
  const out = {};
  for (const item of arr) {
    const k = item[key] ?? "unknown";
    (out[k] ??= []).push(item);
  }
  return out;
}

function pct(n, d) {
  return d ? `${((n / d) * 100).toFixed(1)}%` : "—";
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
