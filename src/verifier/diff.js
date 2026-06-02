/**
 * Compare two arrays of normalized violation records and produce the verifier
 * delta — used by both the verifier index and the regression analyzer.
 *
 * Matching strategy:
 *   - NavA11y issues fresh UUIDs on every run, so id-based matching falsely
 *     marks identical violations as "resolved + new failure". We canonicalize
 *     by (sc, element.selector) — stable across runs of the same fixture.
 *   - When the caller passes `targetId`, we also accept matching the target
 *     by its (sc, selector) signature looked up in baseline.
 *
 * Returns:
 *   resolved      — FAIL in baseline, NOT in post.
 *   newFailures   — FAIL in post, NOT in baseline.
 *   stillFailing  — FAIL in both.
 */
export function diffViolations(baseline, post, opts = {}) {
  const { targetId = null, scFilter = null } = opts;
  const matchKey = (v) => `${v.sc}:${v.element?.selector ?? "page"}`;

  const baselineFails = baseline.filter(
    (v) =>
      v.result === "FAIL" && (scFilter == null || v.sc === scFilter),
  );
  const postFails = post.filter(
    (v) =>
      v.result === "FAIL" && (scFilter == null || v.sc === scFilter),
  );

  const postKeys = new Set(postFails.map(matchKey));
  const baselineKeys = new Set(baselineFails.map(matchKey));

  const resolved = baselineFails.filter((v) => !postKeys.has(matchKey(v)));
  const newFailures = postFails.filter((v) => !baselineKeys.has(matchKey(v)));
  const stillFailing = baselineFails.filter((v) => postKeys.has(matchKey(v)));

  const targetResolved =
    targetId == null
      ? null
      : resolved.some((v) => matchKey(v) === targetId);

  return { resolved, newFailures, stillFailing, targetResolved, matchKey };
}
