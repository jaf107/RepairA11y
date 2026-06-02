import { verify } from "../verifier/index.js";

/**
 * Repair loop — orchestrates Stages 1→5 for a single violation.
 *
 * No agent framework — plain JS function calls (per CLAUDE.md "No agent
 * frameworks"). The loop calls a user-supplied generator with the current
 * evidence + history, applies the resulting patch, verifies, and either
 * accepts it (RESOLVED) or feeds the failure context back into the next
 * generation attempt.
 *
 * @param {object} opts
 * @param {object} opts.violation       Normalized violation record from detector
 * @param {string} opts.htmlFile        Path to the fixture/page to repair
 * @param {object} opts.generator       Object with `.generate({evidence, history, attempt}) -> patch|null`
 * @param {object} opts.evidence        Pre-packaged evidence bundle to pass to generator
 * @param {number} [opts.maxIterations]  Default 5
 * @param {number} [opts.ssimThreshold]  Default 0.9
 * @returns {Promise<{
 *   status: 'RESOLVED'|'UNRESOLVED'|'DECLINED'|'ERROR',
 *   iterations: number,
 *   acceptedPatch: object|null,
 *   history: Array<{ iter:number, patch:object|null, verify?:object, error?:string }>
 * }>}
 */
export async function repairLoop(opts) {
  const {
    violation,
    htmlFile,
    generator,
    evidence,
    maxIterations = 5,
    ssimThreshold = 0.9,
  } = opts;

  const history = [];

  for (let iter = 1; iter <= maxIterations; iter++) {
    let patch;
    try {
      patch = await generator.generate({
        violation,
        evidence,
        history: history.slice(),
        attempt: iter,
      });
    } catch (err) {
      history.push({ iter, patch: null, error: `generator: ${err.message}` });
      return { status: "ERROR", iterations: iter, acceptedPatch: null, history };
    }

    if (!patch) {
      history.push({ iter, patch: null, error: "generator returned null" });
      return {
        status: "DECLINED",
        iterations: iter,
        acceptedPatch: null,
        history,
      };
    }

    let verifyResult;
    try {
      verifyResult = await verify({
        htmlFile,
        patch,
        targetSc: violation.sc,
        targetSelector: violation.element?.selector ?? null,
        scFilter: violation.sc,
        ssimThreshold,
      });
    } catch (err) {
      history.push({ iter, patch, error: `verify: ${err.message}` });
      continue;
    }

    history.push({ iter, patch, verify: summarizeVerify(verifyResult) });

    if (verifyResult.status === "RESOLVED") {
      return {
        status: "RESOLVED",
        iterations: iter,
        acceptedPatch: patch,
        history,
      };
    }
    // UNRESOLVED or REGRESSED → next iteration will see this in history.
  }

  return {
    status: "UNRESOLVED",
    iterations: maxIterations,
    acceptedPatch: null,
    history,
  };
}

function summarizeVerify(v) {
  return {
    status: v.status,
    targetResolved: v.targetResolved,
    regressed: v.regressed,
    ssimRegressed: v.ssimRegressed,
    similarity: v.ssim?.similarity ?? null,
    newFailureCount: v.newFailures.length,
    resolvedCount: v.resolved.length,
  };
}
