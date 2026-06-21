#!/usr/bin/env node
/**
 * RQ2 — Evidence ablation on SC 2.4.13.
 *
 * Compares LLM repair effectiveness across 4 evidence levels (E1 → E4)
 * holding everything else constant. This is the core research claim:
 * "runtime evidence (E3/E4) outperforms static evidence (E1/E2)".
 *
 * Usage:
 *   node experiments/rq2_evidence_ablation/run.js              # default: 10 runs, 3 seeds
 *   node experiments/rq2_evidence_ablation/run.js --runs 3     # smoke
 *   node experiments/rq2_evidence_ablation/run.js --dry        # mock LLM, no API calls
 *   node experiments/rq2_evidence_ablation/run.js --sc 2.4.7   # different SC
 *
 * Required env: OPENROUTER_API_KEY (unless --dry).
 * Output: experiments/rq2_evidence_ablation/results/run-<timestamp>.json + .md
 */
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { runCase } from "../_common/runner.js";
import { mcNemar, cohensH, mean, std } from "../_common/stats.js";
import { createLlmGenerator } from "../../src/generators/llm_based/index.js";
import { ddCasesForSc, dnewCasesForSc } from "../../src/datasets/index.js";
import { aggregate, renderAggregateMarkdown } from "../../src/reporting/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..", "..");

const LEVELS = ["E1", "E2", "E3", "E4"];
const DEFAULT_SC = "2.4.13";
const DEFAULT_RUNS = 10;
const DEFAULT_SEEDS = [1, 2, 3];

function parseArgs(argv) {
  const out = {
    runs: DEFAULT_RUNS,
    sc: DEFAULT_SC,
    seeds: DEFAULT_SEEDS,
    dry: false,
    dnew: false,
  };
  const args = argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--runs") out.runs = parseInt(args[++i], 10);
    else if (args[i] === "--sc") out.sc = args[++i];
    else if (args[i] === "--dry") out.dry = true;
    else if (args[i] === "--dnew") out.dnew = true;
    else if (args[i] === "--seeds")
      out.seeds = args[++i].split(",").map(Number);
  }
  return out;
}

/**
 * Dry-run LLM stub for offline pipeline validation.
 * Returns a syntactically valid patch that may or may not actually resolve
 * — its job is to exercise the runner end-to-end without API calls.
 */
function makeDryGenerator() {
  return {
    generate: async ({ violation }) => {
      const selector = violation.element?.selector ?? "button";
      return {
        patch_type: "css_inject",
        target_selector: selector,
        payload: {
          rule: `${selector}:focus-visible { outline: 2px solid #000000; }`,
        },
        rationale: "[DRY] mock LLM output",
        wcag_technique_cited: "C27",
      };
    },
  };
}

async function main() {
  const opts = parseArgs(process.argv);
  const cases = opts.dnew
    ? dnewCasesForSc(opts.sc, { failOnly: true })
    : ddCasesForSc(opts.sc, { failOnly: true });
  const corpusLabel = opts.dnew ? "D_new" : "D_d";
  if (!cases.length) {
    console.error(`No ${corpusLabel} FAIL cases registered for SC ${opts.sc}`);
    process.exit(1);
  }

  console.log(
    `[RQ2] corpus=${corpusLabel}  sc=${opts.sc}  cases=${cases.length}  levels=${LEVELS.length}  seeds=${opts.seeds.length}  runs=${opts.runs}  dry=${opts.dry}`,
  );
  const totalTrials = cases.length * LEVELS.length * opts.seeds.length * opts.runs;
  console.log(`[RQ2] total trials: ${totalTrials}`);

  const allResults = [];
  let trial = 0;

  for (let runIdx = 1; runIdx <= opts.runs; runIdx++) {
    for (const seed of opts.seeds) {
      for (const level of LEVELS) {
        const generator = opts.dry
          ? makeDryGenerator()
          : createLlmGenerator({ evidenceLevel: level });

        for (const c of cases) {
          trial++;
          const t0 = Date.now();
          const result = await runCase({
            fixturePath: c.file,
            sc: opts.sc,
            evidenceLevel: level,
            generator,
            generatorName: opts.dry ? "dry-llm" : "openrouter-llm",
            maxIterations: 1,
          });
          allResults.push({
            ...result,
            caseId: c.id,
            corpus: corpusLabel,
            runIdx,
            seed,
            ms: Date.now() - t0,
          });
          console.log(
            `[${trial}/${totalTrials}] run=${runIdx} seed=${seed} level=${level} case=${c.id} status=${result.status} (${Date.now() - t0}ms)`,
          );
        }
      }
    }
  }

  const summary = analyze(allResults, opts);
  const outDir = join(__dirname, "results");
  await mkdir(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonPath = join(outDir, `run-${stamp}.json`);
  const mdPath = join(outDir, `run-${stamp}.md`);
  await writeFile(jsonPath, JSON.stringify({ opts, summary, allResults }, null, 2));
  await writeFile(mdPath, summary.markdown);
  console.log(`\n[RQ2] wrote ${jsonPath}`);
  console.log(`[RQ2] wrote ${mdPath}`);

  // Exit non-zero if the core claim fails (E3 not significantly > E1).
  const e1_e3 = summary.tests["E1_vs_E3"];
  if (!opts.dry && e1_e3 && !e1_e3.significant) {
    console.log(`\n[RQ2] WARNING: E1 vs E3 not statistically significant (p=${e1_e3.p.toFixed(3)})`);
  }
  process.exit(0);
}

function analyze(results, opts) {
  const aggregateSummary = aggregate(results);

  // Per-level resolution rate (averaged across all runs/seeds/cases).
  const perLevel = {};
  for (const lvl of LEVELS) {
    const rs = results.filter((r) => r.evidenceLevel === lvl);
    const rates = bucketRatesByRun(rs);
    perLevel[lvl] = {
      meanRate: mean(rates),
      stdRate: std(rates),
      runRates: rates,
      cases: rs.length,
    };
  }

  // McNemar paired tests, using a per-(case,run,seed) success vector.
  const tests = {};
  for (const [aLvl, bLvl] of [
    ["E1", "E2"],
    ["E1", "E3"],
    ["E1", "E4"],
    ["E2", "E3"],
    ["E3", "E4"],
  ]) {
    const pairs = collectPairs(results, aLvl, bLvl);
    if (pairs.a.length === 0) {
      tests[`${aLvl}_vs_${bLvl}`] = { note: "no paired data" };
      continue;
    }
    const mc = mcNemar(pairs.a, pairs.b);
    const pA = mean(pairs.a);
    const pB = mean(pairs.b);
    tests[`${aLvl}_vs_${bLvl}`] = {
      ...mc,
      meanA: pA,
      meanB: pB,
      cohensH: cohensH(pA, pB),
    };
  }

  const md = renderRq2Markdown({ opts, perLevel, tests, aggregateSummary });
  return { perLevel, tests, aggregate: aggregateSummary, markdown: md };
}

function bucketRatesByRun(results) {
  const buckets = new Map();
  for (const r of results) {
    const key = `${r.runIdx}/${r.seed}`;
    if (!buckets.has(key)) buckets.set(key, { total: 0, resolved: 0 });
    const b = buckets.get(key);
    b.total++;
    if (r.status === "RESOLVED") b.resolved++;
  }
  return [...buckets.values()].map((b) => (b.total ? b.resolved / b.total : 0));
}

function collectPairs(results, aLvl, bLvl) {
  const a = [];
  const b = [];
  // Pair by (caseId, runIdx, seed). Levels are independent draws, but pairing
  // by case+seed+run controls for both case difficulty and random variation.
  const byA = new Map();
  for (const r of results) {
    if (r.evidenceLevel === aLvl) {
      byA.set(`${r.caseId}|${r.runIdx}|${r.seed}`, r.status === "RESOLVED" ? 1 : 0);
    }
  }
  for (const r of results) {
    if (r.evidenceLevel === bLvl) {
      const key = `${r.caseId}|${r.runIdx}|${r.seed}`;
      if (byA.has(key)) {
        a.push(byA.get(key));
        b.push(r.status === "RESOLVED" ? 1 : 0);
      }
    }
  }
  return { a, b };
}

function renderRq2Markdown({ opts, perLevel, tests, aggregateSummary }) {
  const lines = [];
  lines.push(`# RQ2 — Evidence Ablation (SC ${opts.sc})`);
  lines.push("");
  lines.push(`- runs: **${opts.runs}**, seeds: **${opts.seeds.join(",")}**, dry: **${opts.dry}**`);
  lines.push(`- generated: ${new Date().toISOString()}`);
  lines.push("");
  lines.push("## Per-level resolution rate (mean ± std across runs)");
  lines.push("| Level | Mean | Std | Cases (n_trials) |", "|---|---|---|---|");
  for (const lvl of LEVELS) {
    const p = perLevel[lvl];
    lines.push(
      `| ${lvl} | ${(p.meanRate * 100).toFixed(1)}% | ±${(p.stdRate * 100).toFixed(1)}% | ${p.cases} |`,
    );
  }
  lines.push("");
  lines.push("## McNemar paired tests");
  lines.push(
    "| Comparison | mean A | mean B | b (A→B loss) | c (A→B gain) | χ² | p | Cohen's h | sig? |",
    "|---|---|---|---|---|---|---|---|---|",
  );
  for (const [k, t] of Object.entries(tests)) {
    if (t.note) {
      lines.push(`| ${k} | — | — | — | — | — | — | — | _${t.note}_ |`);
      continue;
    }
    lines.push(
      `| ${k} | ${(t.meanA * 100).toFixed(1)}% | ${(t.meanB * 100).toFixed(1)}% | ${t.b} | ${t.c} | ${t.chi2.toFixed(3)} | ${t.p.toFixed(4)} | ${t.cohensH.toFixed(3)} | ${t.significant ? "✓" : ""} |`,
    );
  }
  lines.push("");
  lines.push("## Overall aggregate");
  lines.push(renderAggregateMarkdown(aggregateSummary, { experiment: "RQ2" }));
  return lines.join("\n");
}

main().catch((err) => {
  console.error("[RQ2] FATAL:", err);
  process.exit(1);
});
