/**
 * Shared experiment runner — used by RQ1, RQ2, RQ4 drivers.
 *
 * Sequence per case:
 *   1. detect (one-shot baseline)
 *   2. select target violation
 *   3. package evidence at the requested level
 *   4. repair loop (generator → apply → verify)
 *   5. collect status + verify summary + patch
 *
 * Errors per case are captured, not thrown, so a single bad fixture cannot
 * sink a 10-run experiment.
 */
import { runDetection } from "../../src/detector/index.js";
import { packageEvidence } from "../../src/evidence/packager.js";
import { repairLoop } from "../../src/loop/repair_loop.js";

export async function runCase({
  fixturePath,
  sc,
  evidenceLevel = "E3",
  generator,
  generatorName,
  maxIterations = 1,
  targetSelector = null,
}) {
  try {
    const detection = await runDetection({ htmlFile: fixturePath });
    // When targetSelector is given (D_r: many FAILs per page), pin the exact
    // element so each distinct FAIL is repaired — not just the first of its SC.
    const target = detection.violations.find(
      (v) =>
        v.sc === sc &&
        v.result === "FAIL" &&
        (!targetSelector || v.element?.selector === targetSelector),
    );
    if (!target) {
      return {
        fixturePath,
        sc,
        evidenceLevel,
        generator: generatorName,
        status: "NO_FAIL",
        verify: null,
        patch: null,
        iterations: 0,
      };
    }

    const evidence = await packageEvidence({
      violation: target,
      level: evidenceLevel,
      htmlPath: fixturePath,
      screenshotPath: target.screenshot ?? null,
    });

    const result = await repairLoop({
      violation: target,
      htmlFile: fixturePath,
      generator,
      evidence,
      maxIterations,
    });
    const lastVerify = result.history.at(-1)?.verify ?? null;

    return {
      fixturePath,
      sc,
      evidenceLevel,
      generator: generatorName,
      status: result.status,
      iterations: result.iterations,
      patch: result.acceptedPatch ?? result.history.at(-1)?.patch ?? null,
      verify: lastVerify,
    };
  } catch (e) {
    return {
      fixturePath,
      sc,
      evidenceLevel,
      generator: generatorName,
      status: "ERROR",
      error: e.message,
      verify: null,
      patch: null,
      iterations: 0,
    };
  }
}
