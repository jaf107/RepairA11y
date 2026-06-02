#!/usr/bin/env node
/**
 * repair-url — repair every focus-behavior violation found on a URL or
 * local HTML file. Generator can be rule-based (deterministic, default) or
 * LLM-based (needs OPENROUTER_API_KEY).
 *
 * Usage:
 *   npm run repair:url -- <url-or-file> [options]
 *
 * Options:
 *   --generator <rule|llm>   default: rule
 *   --level <E1|E2|E3|E4>    evidence level for LLM (default: E3)
 *   --sc <2.4.7|2.4.11|2.4.12|2.4.13>   filter to one SC
 *   --max <N>                cap number of cases (default: all FAILs)
 *   --iter <N>               max iterations per case (default: 3)
 *   --json <path>            also write JSON output to file
 *
 * Examples:
 *   npm run repair:url -- https://www.qualtrics.com
 *   npm run repair:url -- ./my-page.html --generator llm --level E3
 *   npm run repair:url -- https://example.com --sc 2.4.13 --max 5
 */
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve, isAbsolute } from "node:path";
import { existsSync } from "node:fs";
import { runDetection } from "../src/detector/index.js";
import { repairLoop } from "../src/loop/repair_loop.js";
import { packageEvidence } from "../src/evidence/packager.js";
import { ruleBasedGenerator } from "../src/generators/rule_based/index.js";
import { createLlmGenerator } from "../src/generators/llm_based/index.js";
import { fetchPageToFile } from "../src/utils/fetchPage.js";
import {
  renderPerCaseMarkdown,
  aggregate,
  renderAggregateMarkdown,
} from "../src/reporting/index.js";

const VALID_SCS = ["2.4.7", "2.4.11", "2.4.12", "2.4.13"];

function parseArgs(argv) {
  const args = argv.slice(2);
  if (!args.length || args[0] === "--help" || args[0] === "-h") {
    usage();
    process.exit(0);
  }
  const opts = {
    target: args[0],
    generator: "rule",
    level: "E3",
    sc: null,
    max: Infinity,
    iter: 3,
    json: null,
  };
  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case "--generator": opts.generator = args[++i]; break;
      case "--level": opts.level = args[++i]; break;
      case "--sc": opts.sc = args[++i]; break;
      case "--max": opts.max = parseInt(args[++i], 10); break;
      case "--iter": opts.iter = parseInt(args[++i], 10); break;
      case "--json": opts.json = args[++i]; break;
      default:
        console.error(`unknown arg: ${args[i]}`);
        process.exit(1);
    }
  }
  if (!["rule", "llm"].includes(opts.generator)) {
    console.error("--generator must be 'rule' or 'llm'");
    process.exit(1);
  }
  if (!["E1", "E2", "E3", "E4"].includes(opts.level)) {
    console.error("--level must be E1, E2, E3, or E4");
    process.exit(1);
  }
  if (opts.sc && !VALID_SCS.includes(opts.sc)) {
    console.error(`--sc must be one of ${VALID_SCS.join(", ")}`);
    process.exit(1);
  }
  return opts;
}

function usage() {
  console.log(`
Usage: npm run repair:url -- <url-or-file> [options]

Options:
  --generator <rule|llm>            default: rule
  --level <E1|E2|E3|E4>             evidence level for LLM (default: E3)
  --sc <2.4.7|2.4.11|2.4.12|2.4.13> filter to one SC
  --max <N>                          cap number of cases (default: all FAILs)
  --iter <N>                         max iterations per case (default: 3)
  --json <path>                      also write JSON output to file

Examples:
  npm run repair:url -- https://www.qualtrics.com
  npm run repair:url -- ./my-page.html --generator llm --level E3
  npm run repair:url -- https://example.com --sc 2.4.13 --max 5
`);
}

function isUrl(s) {
  return /^https?:\/\//i.test(s);
}

async function resolveTarget(target) {
  if (isUrl(target)) {
    console.log(`[fetch] rendering ${target} via Playwright…`);
    const { file, finalUrl } = await fetchPageToFile(target);
    console.log(`[fetch] saved to ${file}  (final URL: ${finalUrl})`);
    return { htmlFile: file, label: target };
  }
  const abs = isAbsolute(target) ? target : resolve(process.cwd(), target);
  if (!existsSync(abs)) {
    throw new Error(`local file not found: ${abs}`);
  }
  return { htmlFile: abs, label: abs };
}

function buildGenerator(opts) {
  if (opts.generator === "rule") return ruleBasedGenerator;
  return createLlmGenerator({ evidenceLevel: opts.level });
}

async function main() {
  const opts = parseArgs(process.argv);
  console.log(`[repair-url] target=${opts.target}  generator=${opts.generator}  level=${opts.level}  sc=${opts.sc ?? "all"}  iter=${opts.iter}`);

  const { htmlFile, label } = await resolveTarget(opts.target);

  console.log(`[detect] running NavA11y against ${htmlFile}…`);
  const detection = await runDetection({ htmlFile });
  const allFails = detection.violations.filter(
    (v) =>
      v.result === "FAIL" &&
      (!opts.sc || v.sc === opts.sc) &&
      VALID_SCS.includes(v.sc),
  );
  console.log(`[detect] ${detection.violations.length} records, ${allFails.length} target FAILs`);

  if (!allFails.length) {
    console.log("[repair-url] no in-scope FAILs to repair — nothing to do");
    process.exit(0);
  }

  const cases = allFails.slice(0, opts.max);
  const generator = buildGenerator(opts);
  const results = [];

  for (const [i, violation] of cases.entries()) {
    console.log(
      `\n[case ${i + 1}/${cases.length}] sc=${violation.sc}  selector=${violation.element?.selector ?? "(page)"}`,
    );
    if (violation.reason) console.log(`  reason: ${violation.reason}`);

    const evidence = await packageEvidence({
      violation,
      level: opts.level,
      htmlPath: htmlFile,
      screenshotPath: violation.screenshot ?? null,
    });

    const loopResult = await repairLoop({
      violation,
      htmlFile,
      generator,
      evidence,
      maxIterations: opts.iter,
    });

    const verify = loopResult.history.at(-1)?.verify ?? null;
    console.log(
      `  → ${loopResult.status}  iter=${loopResult.iterations}  resolved=${verify?.targetResolved ?? "n/a"}  newFailures=${verify?.newFailureCount ?? "n/a"}  ssim=${verify?.similarity?.toFixed?.(3) ?? "n/a"}`,
    );
    if (loopResult.acceptedPatch) {
      console.log(`  patch: ${JSON.stringify(loopResult.acceptedPatch.payload).slice(0, 120)}`);
    }
    results.push({
      caseId: violation.id ?? `${violation.sc}:${violation.element?.selector}`,
      sc: violation.sc,
      selector: violation.element?.selector ?? null,
      status: loopResult.status,
      iterations: loopResult.iterations,
      patch: loopResult.acceptedPatch,
      verify,
      generator: opts.generator,
      evidenceLevel: opts.level,
    });
  }

  const summary = aggregate(results);
  console.log("\n=== SUMMARY ===");
  console.log(`  target: ${label}`);
  console.log(`  cases: ${summary.total}`);
  console.log(`  resolved: ${summary.resolved} (${(summary.resolutionRate * 100).toFixed(1)}%)`);
  console.log(`  regression rate: ${(summary.regressionRate * 100).toFixed(1)}%`);
  console.log(`  mean ssim: ${summary.meanSimilarity?.toFixed?.(3) ?? "n/a"}`);
  console.log("");
  console.log(renderAggregateMarkdown(summary, { experiment: "repair-url" }));

  if (opts.json) {
    const path = isAbsolute(opts.json) ? opts.json : resolve(process.cwd(), opts.json);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(
      path,
      JSON.stringify(
        {
          target: opts.target,
          options: opts,
          summary,
          cases: results.map((r) => ({
            ...r,
            // Trim verify down for JSON — full violation arrays are huge.
            verify: r.verify
              ? {
                  status: r.verify.status,
                  targetResolved: r.verify.targetResolved,
                  newFailureCount: r.verify.newFailureCount,
                  similarity: r.verify.similarity,
                }
              : null,
          })),
        },
        null,
        2,
      ),
    );
    console.log(`\n[repair-url] wrote ${path}`);
  }

  process.exit(summary.resolved === summary.total ? 0 : 1);
}

main().catch((e) => {
  console.error("[repair-url] FATAL:", e);
  process.exit(1);
});
