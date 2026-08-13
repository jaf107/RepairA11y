#!/usr/bin/env node
/**
 * SC 2.4.7 co-resolution audit.
 *
 * Claim to verify for the thesis: repairs that resolve SC 2.4.13 also resolve
 * SC 2.4.7 on every dual-flagged element (2.4.13 is the strictly stronger
 * criterion under NavA11y's checks).
 *
 * Method: for each 2.4.13 FAIL case in D_d + D_new, take the stored E3 seed-1
 * patch from the final RQ2 runs, re-apply it with the standard verifier
 * (detectWithPatch), and compare per-SC FAIL counts before/after.
 *
 * Usage: node --env-file=.env experiments/sc247_coresolution_audit.js
 * Output: experiments/rq2_evidence_ablation/results/sc247-coresolution-<ts>.{json,md}
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { detectWithPatch } from "../src/verifier/runWithPatch.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const RESULTS_DIR = join(__dirname, "rq2_evidence_ablation/results");

// Final honest-oracle 2.4.13 runs (D_d v2, D_new v2).
const RUN_FILES = [
  "run-2026-08-13T12-04-58-051Z.json",
  "run-2026-08-13T14-29-24-441Z.json",
];

function countFails(detection, sc) {
  return (detection.violations ?? []).filter(
    (v) => v.sc === sc && v.result === "FAIL",
  ).length;
}

async function main() {
  const rows = [];
  for (const rf of RUN_FILES) {
    let run;
    try {
      run = JSON.parse(await readFile(join(RESULTS_DIR, rf), "utf8"));
    } catch {
      // Fall back: match by prefix if exact timestamp differs.
      continue;
    }
    const trials = (run.allResults ?? []).filter(
      (t) => t.evidenceLevel === "E3" && t.seed === 1 && t.patch,
    );
    for (const t of trials) {
      const htmlFile = t.fixturePath.startsWith("/")
        ? t.fixturePath
        : join(repoRoot, t.fixturePath);
      process.stdout.write(`[audit] ${t.caseId} … `);
      const { baselineDetection, patchedDetection } = await detectWithPatch({
        htmlFile,
        patch: t.patch,
      });
      const row = {
        caseId: t.caseId,
        corpus: t.corpus,
        before247: countFails(baselineDetection, "2.4.7"),
        after247: countFails(patchedDetection, "2.4.7"),
        before2413: countFails(baselineDetection, "2.4.13"),
        after2413: countFails(patchedDetection, "2.4.13"),
      };
      rows.push(row);
      console.log(
        `2.4.7 ${row.before247}→${row.after247} | 2.4.13 ${row.before2413}→${row.after2413}`,
      );
    }
  }

  const dual = rows.filter((r) => r.before247 > 0);
  const coResolved = dual.filter((r) => r.after247 === 0);
  const summary = {
    casesAudited: rows.length,
    dualFlaggedCases: dual.length,
    dualFlagged247Elements: dual.reduce((a, r) => a + r.before247, 0),
    coResolvedCases: coResolved.length,
    residual247Elements: dual.reduce((a, r) => a + r.after247, 0),
  };
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const md = [
    "# SC 2.4.7 co-resolution audit",
    "",
    `- generated: ${new Date().toISOString()}`,
    "- patches: E3 seed-1 from the final honest-oracle 2.4.13 runs",
    "",
    "| Case | Corpus | 2.4.7 FAILs before→after | 2.4.13 FAILs before→after |",
    "|---|---|---|---|",
    ...rows.map(
      (r) =>
        `| ${r.caseId} | ${r.corpus} | ${r.before247}→${r.after247} | ${r.before2413}→${r.after2413} |`,
    ),
    "",
    "## Summary",
    `- Cases audited: **${summary.casesAudited}**`,
    `- Dual-flagged (≥1 2.4.7 FAIL at baseline): **${summary.dualFlaggedCases}** cases, ${summary.dualFlagged247Elements} elements`,
    `- Co-resolved (0 residual 2.4.7 FAILs after 2.4.13 patch): **${summary.coResolvedCases}/${summary.dualFlaggedCases}** cases, residual elements: ${summary.residual247Elements}`,
  ].join("\n");

  await writeFile(join(RESULTS_DIR, `sc247-coresolution-${ts}.json`), JSON.stringify({ summary, rows }, null, 2));
  await writeFile(join(RESULTS_DIR, `sc247-coresolution-${ts}.md`), md);
  console.log("\n" + md.split("## Summary")[1]);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
