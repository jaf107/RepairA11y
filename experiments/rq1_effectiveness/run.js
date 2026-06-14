#!/usr/bin/env node
/**
 * RQ1 — Effectiveness on D_d (controlled) and D_r (production sites).
 *
 * Compares rule-based vs LLM-based generators across all 4 SCs
 * (2.4.7, 2.4.11, 2.4.12, 2.4.13). Single iteration per case.
 *
 * Usage:
 *   node experiments/rq1_effectiveness/run.js                 # D_d, both generators
 *   node experiments/rq1_effectiveness/run.js --rule-only     # skip LLM
 *   node experiments/rq1_effectiveness/run.js --runs 3        # LLM only: 3 seeds
 *   node experiments/rq1_effectiveness/run.js --dr            # ALSO run D_r (slow)
 *   node experiments/rq1_effectiveness/run.js --dry           # mock LLM
 */
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { runCase } from "../_common/runner.js";
import { ruleBasedGenerator } from "../../src/generators/rule_based/index.js";
import { createLlmGenerator } from "../../src/generators/llm_based/index.js";
import { ddCasesForSc } from "../../src/datasets/index.js";
import { aggregate, renderAggregateMarkdown } from "../../src/reporting/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..", "..");

const SCS = ["2.4.7", "2.4.11", "2.4.12", "2.4.13"];

function parseArgs(argv) {
  const out = {
    runs: 3,
    ruleOnly: false,
    llmOnly: false,
    dr: false,
    dry: false,
    scs: SCS,
    evidenceLevel: "E3",
  };
  const a = argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    if (a[i] === "--runs") out.runs = parseInt(a[++i], 10);
    else if (a[i] === "--rule-only") out.ruleOnly = true;
    else if (a[i] === "--llm-only") out.llmOnly = true;
    else if (a[i] === "--dr") out.dr = true;
    else if (a[i] === "--dry") out.dry = true;
    else if (a[i] === "--sc") out.scs = [a[++i]];
    else if (a[i] === "--level") out.evidenceLevel = a[++i];
  }
  return out;
}

function makeDryGenerator() {
  return {
    generate: async ({ violation }) => ({
      patch_type: "css_inject",
      target_selector: violation.element?.selector ?? "button",
      payload: {
        rule: `${violation.element?.selector ?? "button"}:focus-visible { outline: 2px solid #000; }`,
      },
      rationale: "[DRY] mock",
      wcag_technique_cited: "C27",
    }),
  };
}

async function loadDrCases() {
  const datasetJson = await readFile(
    join(repoRoot, "nava11y/evaluation/dataset.json"),
    "utf8",
  ).catch(() => null);
  if (!datasetJson) return [];
  const ds = JSON.parse(datasetJson);
  return (Array.isArray(ds) ? ds : ds.sites ?? []).map((s) => ({
    id: typeof s === "string" ? s : s.id ?? s.url,
    url: typeof s === "string" ? s : s.url,
  }));
}

async function main() {
  const opts = parseArgs(process.argv);
  console.log(`[RQ1] runs=${opts.runs} dr=${opts.dr} dry=${opts.dry}`);

  const all = [];

  for (const sc of opts.scs) {
    const ddCases = ddCasesForSc(sc, { failOnly: true });
    console.log(`[RQ1] SC ${sc} — ${ddCases.length} D_d FAIL cases`);

    if (!opts.llmOnly) {
      console.log(`[RQ1] running rule-based on D_d…`);
      for (const c of ddCases) {
        const r = await runCase({
          fixturePath: c.file,
          sc,
          evidenceLevel: "E1",
          generator: ruleBasedGenerator,
          generatorName: "rule_based",
          maxIterations: 1,
        });
        all.push({ ...r, caseId: c.id, corpus: "D_d", runIdx: 1, seed: 0 });
      }
    }

    if (!opts.ruleOnly) {
      console.log(`[RQ1] running LLM (${opts.runs} seeds) on D_d…`);
      for (let run = 1; run <= opts.runs; run++) {
        const gen = opts.dry
          ? makeDryGenerator()
          : createLlmGenerator({ evidenceLevel: opts.evidenceLevel });
        for (const c of ddCases) {
          const r = await runCase({
            fixturePath: c.file,
            sc,
            evidenceLevel: opts.evidenceLevel,
            generator: gen,
            generatorName: "llm_based",
            maxIterations: 1,
          });
          all.push({ ...r, caseId: c.id, corpus: "D_d", runIdx: run, seed: run });
        }
      }
    }
  }

  if (opts.dr) {
    const drCases = await loadDrCases();
    console.log(`[RQ1] D_r — ${drCases.length} sites (this is slow!)`);
    // D_r enumeration: detect each site, repair every FAIL across our 4 SCs.
    const { fetchPageToFile } = await import("../../src/utils/fetchPage.js");
    for (const site of drCases) {
      const url = site.url;
      try {
        // Capture the live, post-hydration page to a static snapshot so the
        // verifier can re-test a patched copy (live SPAs can't be re-tested in
        // place). Detection + repair + verify all run against this one artifact.
        const { file: snapshot } = await fetchPageToFile(url);
        const det = await runDetection({ htmlFile: snapshot });
        const fails = det.violations.filter(
          (v) => v.result === "FAIL" && SCS.includes(v.sc),
        );
        console.log(`[RQ1]   ${url} — ${fails.length} in-scope FAILs`);
        for (const v of fails) {
          for (const [genName, gen] of activeGenerators(opts)) {
            const result = await runCase({
              fixturePath: snapshot,
              sc: v.sc,
              evidenceLevel: opts.evidenceLevel,
              generator: gen,
              generatorName: genName,
              maxIterations: 1,
              targetSelector: v.element?.selector ?? null,
            });
            all.push({
              ...result,
              caseId: `${site.id}#${v.id ?? v.element?.selector}`,
              corpus: "D_r",
              runIdx: 1,
              seed: 0,
            });
          }
        }
      } catch (e) {
        all.push({
          status: "ERROR",
          error: `${url}: ${e.message}`,
          sc: "n/a",
          corpus: "D_r",
          caseId: site.id,
        });
      }
    }
  }

  const summary = aggregate(all);
  const outDir = join(__dirname, "results");
  await mkdir(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  await writeFile(
    join(outDir, `run-${stamp}.json`),
    JSON.stringify({ opts, summary, all }, null, 2),
  );
  await writeFile(
    join(outDir, `run-${stamp}.md`),
    renderAggregateMarkdown(summary, { experiment: "RQ1" }),
  );
  console.log(`\n[RQ1] wrote experiments/rq1_effectiveness/results/run-${stamp}.{json,md}`);
  console.log(
    `[RQ1] overall: ${(summary.resolutionRate * 100).toFixed(1)}% (${summary.resolved}/${summary.total})`,
  );
}

function* activeGenerators(opts) {
  if (!opts.llmOnly) yield ["rule_based", ruleBasedGenerator];
  if (!opts.ruleOnly) {
    yield [
      "llm_based",
      opts.dry
        ? makeDryGenerator()
        : createLlmGenerator({ evidenceLevel: opts.evidenceLevel }),
    ];
  }
}

main().catch((e) => {
  console.error("[RQ1] FATAL:", e);
  process.exit(1);
});
