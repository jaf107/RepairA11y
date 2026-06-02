#!/usr/bin/env node
/**
 * Batch 1 end-to-end smoke test.
 *
 * Walks every ground-truth patch through Stages 4→5 (apply, verify) to prove
 * the applier + verifier + repair loop work together. Uses a fixed-output
 * "oracle generator" (returns the ground-truth patch verbatim) — this isolates
 * Stage 4/5 from Stage 3 (generator) so Batch 1 can be validated independently.
 *
 * Usage:
 *   node scripts/batch-1-e2e.js
 *
 * Exit code 0 = all ground-truth cases RESOLVED; 1 = any case failed.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { runDetection } from "../src/detector/index.js";
import { repairLoop } from "../src/loop/repair_loop.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

const CASES = [
  "ground-truth/sc-2.4.13-focus-appearance-outline-contrast.json",
  "ground-truth/sc-2.4.11-focus-obscured-by-fixed-footer.json",
  "ground-truth/sc-2.4.3-positive-tabindex.json",
];

function load(rel) {
  return JSON.parse(readFileSync(join(repoRoot, rel), "utf8"));
}

function oracleGeneratorFor(patch) {
  return {
    generate: async () => patch,
  };
}

async function runOne(rel) {
  const { fixture, sc, patch } = load(rel);
  const fixturePath = join(repoRoot, fixture);

  console.log(`\n[smoke] ${rel}`);
  console.log(`  fixture: ${fixture}`);

  console.log("  detecting baseline...");
  const detection = await runDetection({ htmlFile: fixturePath });
  const violation = detection.violations.find(
    (v) => v.sc === sc && v.result === "FAIL",
  );
  if (!violation) {
    console.log(`  [SKIP] no FAIL with sc=${sc} in detector output`);
    return { rel, status: "NO_FAIL" };
  }
  console.log(`  target: ${violation.element?.selector ?? "(page-level)"}`);

  console.log("  running repair loop (single iteration, oracle patch)...");
  const result = await repairLoop({
    violation,
    htmlFile: fixturePath,
    generator: oracleGeneratorFor(patch),
    evidence: {},
    maxIterations: 1,
  });

  const v = result.history.at(-1)?.verify;
  console.log(
    `  status=${result.status}  iter=${result.iterations}  similarity=${v?.similarity?.toFixed(3) ?? "n/a"}  newFailures=${v?.newFailureCount ?? "n/a"}`,
  );
  return { rel, status: result.status, verify: v };
}

async function main() {
  console.log("[smoke] Batch 1 E2E: detector → applier → verifier → loop");
  const results = [];
  for (const rel of CASES) {
    try {
      results.push(await runOne(rel));
    } catch (e) {
      console.error(`  [ERROR] ${e.message}`);
      results.push({ rel, status: "ERROR", error: e.message });
    }
  }

  console.log("\n=== SUMMARY ===");
  for (const r of results) {
    console.log(
      `  ${r.status.padEnd(10)} ${r.rel}${r.error ? "  (" + r.error + ")" : ""}`,
    );
  }

  const allResolved = results.every((r) => r.status === "RESOLVED");
  process.exit(allResolved ? 0 : 1);
}

main().catch((err) => {
  console.error("[smoke] FATAL:", err);
  process.exit(1);
});
