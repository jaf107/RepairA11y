#!/usr/bin/env node
/**
 * Batch 2 end-to-end: run the rule-based SC 2.4.13 generator across the full
 * D_d 2.4.13 corpus and print per-case status.
 *
 * Milestone 3 gate: target 100% resolution on D_d 2.4.13 FAIL cases.
 *
 * Usage: node scripts/batch-2-e2e.js
 */
import { runCase } from "../experiments/_common/runner.js";
import { ruleBasedGenerator } from "../src/generators/rule_based/index.js";
import { ddCasesForSc } from "../src/datasets/index.js";

async function main() {
  const cases = ddCasesForSc("2.4.13", { failOnly: true });
  console.log(`[batch-2] running rule-based on ${cases.length} D_d SC 2.4.13 FAIL cases\n`);

  const results = [];
  for (const c of cases) {
    process.stdout.write(`[${c.id}] ... `);
    const r = await runCase({
      fixturePath: c.file,
      sc: "2.4.13",
      evidenceLevel: "E1",
      generator: ruleBasedGenerator,
      generatorName: "rule_based",
      maxIterations: 1,
    });
    console.log(
      `status=${r.status} iter=${r.iterations} ssim=${r.verify?.similarity?.toFixed(3) ?? "n/a"} newFails=${r.verify?.newFailureCount ?? "n/a"}`,
    );
    results.push({ ...r, caseId: c.id });
  }

  const resolved = results.filter((r) => r.status === "RESOLVED").length;
  const declined = results.filter((r) => r.status === "DECLINED").length;
  const noFail = results.filter((r) => r.status === "NO_FAIL").length;
  console.log("\n=== SUMMARY ===");
  console.log(`  RESOLVED:   ${resolved}/${cases.length}`);
  console.log(`  DECLINED:   ${declined}`);
  console.log(`  NO_FAIL:    ${noFail}`);
  console.log(
    `  resolution rate (of cases that produced FAILs): ${(((resolved / Math.max(1, cases.length - noFail)) * 100).toFixed(1))}%`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
