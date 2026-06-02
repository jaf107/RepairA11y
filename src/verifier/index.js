import { detectWithPatch } from "./runWithPatch.js";
import { diffViolations } from "./diff.js";
import { compareScreenshots } from "./ssim.js";

export { compareScreenshots } from "./ssim.js";
export { diffViolations } from "./diff.js";
export { detectWithPatch } from "./runWithPatch.js";

/**
 * Three-pass verifier.
 *
 *  Pass 1: target violation resolved (true/false)
 *  Pass 2: regression detection (new FAILs introduced by the patch)
 *  Pass 3: visual stability (pixel diff between pre/post screenshots)
 *
 * @param {object} opts
 * @param {string} opts.htmlFile      Path to the input fixture
 * @param {object} opts.patch         Typed patch to apply
 * @param {string} [opts.targetId]    Violation id to track resolution for
 * @param {string} [opts.scFilter]    Restrict diff to a single SC
 * @param {number} [opts.ssimThreshold]  Similarity below this triggers ssimRegression flag (default 0.9)
 *
 * @returns {Promise<{
 *   status: 'RESOLVED'|'UNRESOLVED'|'REGRESSED',
 *   targetResolved: boolean,
 *   newFailures: Array,
 *   resolved: Array,
 *   stillFailing: Array,
 *   ssim: object,
 *   regressed: boolean,
 *   detection: { baseline: object, post: object }
 * }>}
 */
export async function verify(opts) {
  const {
    htmlFile,
    patch,
    targetId = null,
    targetSelector = null,
    targetSc = null,
    scFilter = null,
    ssimThreshold = 0.9,
  } = opts;

  const {
    baselineDetection,
    patchedDetection,
    screenshotPath,
    baselineScreenshotPath,
  } = await detectWithPatch({ htmlFile, patch });

  // Canonical id: (sc:selector). targetId is accepted for back-compat with
  // callers that pass NavA11y's UUID, but we prefer the canonical signature
  // because NavA11y reissues UUIDs each run.
  const canonicalTarget =
    targetSc && targetSelector
      ? `${targetSc}:${targetSelector}`
      : targetId;

  const delta = diffViolations(
    baselineDetection.violations,
    patchedDetection.violations,
    { targetId: canonicalTarget, scFilter },
  );

  let ssim;
  try {
    ssim = await compareScreenshots(baselineScreenshotPath, screenshotPath);
  } catch (e) {
    ssim = { similarity: null, error: e.message };
  }

  const ssimRegressed = ssim?.similarity != null && ssim.similarity < ssimThreshold;
  const targetResolved =
    delta.targetResolved === true ||
    (targetId == null &&
      delta.resolved.length > 0 &&
      delta.newFailures.length === 0);
  const regressed = delta.newFailures.length > 0 || ssimRegressed;

  let status;
  if (regressed) status = "REGRESSED";
  else if (targetResolved) status = "RESOLVED";
  else status = "UNRESOLVED";

  return {
    status,
    targetResolved,
    regressed,
    ssimRegressed,
    resolved: delta.resolved,
    newFailures: delta.newFailures,
    stillFailing: delta.stillFailing,
    ssim,
    detection: { baseline: baselineDetection, post: patchedDetection },
  };
}
