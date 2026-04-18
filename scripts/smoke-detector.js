#!/usr/bin/env node
/**
 * Manual smoke test for src/detector/. Runs the full pipeline end-to-end
 * against a local D_d fixture (real Playwright subprocess, real results.json).
 *
 * Usage:
 *   node scripts/smoke-detector.js
 *   node scripts/smoke-detector.js <path-to-html>
 *   node scripts/smoke-detector.js --url https://example.com
 *
 * Excluded from `npm test` — this is the one command to run by hand before a
 * release.
 */
import { runDetection } from "../src/detector/index.js";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

const DEFAULT_FIXTURE = join(
  repoRoot,
  "nava11y/dataset/focus-behavior-dataset/tests/keyboard-access-tabindex-greater-than-0.html",
);

function parseArgs(argv) {
  const args = argv.slice(2);
  if (args.length === 0) return { htmlFile: DEFAULT_FIXTURE };
  if (args[0] === "--url") return { url: args[1] };
  return { htmlFile: resolve(args[0]) };
}

async function main() {
  const opts = parseArgs(process.argv);
  console.log(`[smoke] starting detector with opts: ${JSON.stringify(opts)}`);
  const start = Date.now();
  const out = await runDetection(opts);
  const ms = Date.now() - start;

  const bySC = out.violations.reduce((acc, v) => {
    acc[v.sc] ??= { FAIL: 0, PASS: 0, REVIEW: 0 };
    acc[v.sc][v.result] += 1;
    return acc;
  }, {});

  console.log(`[smoke] finished in ${ms}ms`);
  console.log(`[smoke] report:  ${out.reportDir}`);
  console.log(`[smoke] records: ${out.violations.length}`);
  console.log(`[smoke] by SC:`);
  for (const [sc, counts] of Object.entries(bySC).sort()) {
    console.log(
      `  ${sc}: ${counts.FAIL} FAIL / ${counts.REVIEW} REVIEW / ${counts.PASS} PASS`,
    );
  }

  const firstFail = out.violations.find((v) => v.result === "FAIL");
  if (firstFail) {
    console.log(`[smoke] sample FAIL (${firstFail.sc}):`);
    console.log(`  reason:    ${firstFail.reason}`);
    console.log(`  selector:  ${firstFail.element?.selector ?? "(page-level)"}`);
    console.log(
      `  evidence keys: ${Object.keys(firstFail.evidence).join(", ")}`,
    );
  } else {
    console.log(`[smoke] no FAIL records in this run`);
  }
}

main().catch((error) => {
  console.error(`[smoke] FAILED: ${error.message}`);
  if (error.stderr) console.error(`[smoke] subprocess stderr:\n${error.stderr}`);
  process.exit(1);
});
