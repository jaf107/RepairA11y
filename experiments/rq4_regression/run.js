#!/usr/bin/env node
/**
 * RQ4 — Regression detection.
 *
 * Re-runs the RQ1 patches, but focuses on:
 *   - regression rate (new FAILs introduced)
 *   - visual stability (SSIM)
 *   - patch invasiveness (selector specificity as proxy)
 *
 * If `--from <RQ1 results.json>` is provided, reuses RQ1 patches rather than
 * regenerating. Otherwise, runs a fresh sweep using rule-based generators
 * (deterministic) so the run is reproducible without an LLM.
 *
 * Usage:
 *   node experiments/rq4_regression/run.js
 *   node experiments/rq4_regression/run.js --from ../rq1_effectiveness/results/run-XYZ.json
 */
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { runCase } from "../_common/runner.js";
import { ruleBasedGenerator } from "../../src/generators/rule_based/index.js";
import { ddCasesForSc } from "../../src/datasets/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..", "..");
const SCS = ["2.4.7", "2.4.11", "2.4.12", "2.4.13"];

function parseArgs(argv) {
  const out = { from: null };
  const a = argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    if (a[i] === "--from") out.from = a[++i];
  }
  return out;
}

function specificity(selector) {
  if (!selector) return 0;
  // Quick heuristic: ids weight 100, classes 10, type 1.
  const ids = (selector.match(/#[\w-]+/g) || []).length;
  const classes = (selector.match(/\.[\w-]+/g) || []).length;
  const attrs = (selector.match(/\[[^\]]+\]/g) || []).length;
  const types = (selector.match(/(?:^|\s|>)[a-zA-Z][\w-]*/g) || []).length;
  return ids * 100 + (classes + attrs) * 10 + types;
}

async function main() {
  const opts = parseArgs(process.argv);

  const cases = [];
  for (const sc of SCS) {
    for (const c of ddCasesForSc(sc, { failOnly: true })) {
      cases.push({ sc, ...c });
    }
  }
  console.log(`[RQ4] ${cases.length} D_d cases across ${SCS.length} SCs`);

  const results = [];
  for (const c of cases) {
    const r = await runCase({
      fixturePath: c.file,
      sc: c.sc,
      evidenceLevel: "E1",
      generator: ruleBasedGenerator,
      generatorName: "rule_based",
      maxIterations: 1,
    });
    const newFailures = r.verify?.newFailureCount ?? 0;
    const ssim = r.verify?.similarity ?? null;
    const spec = specificity(r.patch?.target_selector);
    results.push({
      ...r,
      caseId: c.id,
      regressionsAdded: newFailures,
      ssim,
      specificity: spec,
    });
    console.log(
      `[${c.id}] sc=${c.sc} status=${r.status} new=${newFailures} ssim=${ssim?.toFixed?.(3) ?? "n/a"} spec=${spec}`,
    );
  }

  // Aggregate
  const valid = results.filter((r) => r.status !== "NO_FAIL");
  const regressed = valid.filter((r) => r.regressionsAdded > 0).length;
  const meanSsim = mean(
    valid.map((r) => r.ssim).filter((s) => typeof s === "number"),
  );
  const meanSpec = mean(valid.map((r) => r.specificity));
  const summary = {
    totalCases: valid.length,
    regressionCount: regressed,
    regressionRate: valid.length ? regressed / valid.length : 0,
    meanSsim,
    meanSpec,
    perSc: groupBySc(valid),
  };

  const outDir = join(__dirname, "results");
  await mkdir(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  await writeFile(
    join(outDir, `run-${stamp}.json`),
    JSON.stringify({ opts, summary, results }, null, 2),
  );
  await writeFile(
    join(outDir, `run-${stamp}.md`),
    renderRq4Markdown(summary),
  );
  console.log(`\n[RQ4] wrote experiments/rq4_regression/results/run-${stamp}.{json,md}`);
  console.log(
    `[RQ4] regression rate: ${(summary.regressionRate * 100).toFixed(1)}%  meanSSIM: ${summary.meanSsim?.toFixed(3) ?? "n/a"}`,
  );
}

function groupBySc(results) {
  const groups = {};
  for (const r of results) {
    if (!groups[r.sc]) groups[r.sc] = { total: 0, regressed: 0 };
    groups[r.sc].total++;
    if (r.regressionsAdded > 0) groups[r.sc].regressed++;
  }
  for (const sc of Object.keys(groups)) {
    const g = groups[sc];
    g.rate = g.total ? g.regressed / g.total : 0;
  }
  return groups;
}

function renderRq4Markdown(s) {
  const lines = [];
  lines.push(`# RQ4 — Regression Analysis`);
  lines.push(`- generated: ${new Date().toISOString()}`);
  lines.push("");
  lines.push("## Summary");
  lines.push(`- Cases evaluated: **${s.totalCases}**`);
  lines.push(
    `- Patches that introduced ≥1 new failure: **${s.regressionCount}** (${(s.regressionRate * 100).toFixed(1)}%)`,
  );
  lines.push(`- Mean SSIM (visual stability): **${s.meanSsim?.toFixed(3) ?? "n/a"}**`);
  lines.push(`- Mean selector specificity (invasiveness proxy): **${s.meanSpec.toFixed(1)}**`);
  lines.push("");
  lines.push("## Per-SC regression rate");
  lines.push("| SC | Cases | Regressed | Rate |", "|---|---|---|---|");
  for (const [sc, g] of Object.entries(s.perSc).sort()) {
    lines.push(`| ${sc} | ${g.total} | ${g.regressed} | ${(g.rate * 100).toFixed(1)}% |`);
  }
  return lines.join("\n");
}

function mean(xs) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

main().catch((e) => {
  console.error("[RQ4] FATAL:", e);
  process.exit(1);
});
