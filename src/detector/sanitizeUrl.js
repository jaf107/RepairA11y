/**
 * Mirror of NavA11y's URL → report-directory sanitization.
 *
 * Source of truth: `nava11y/reporter/index.js` `initReport()`:
 *   url.replace(/^https?:\/\//, '').replace(/[^a-z0-9]/gi, '_').toLowerCase()
 *
 * We duplicate (rather than import from the vendored copy) so the detector
 * does not reach across the nava11y/ boundary at runtime. The contract is
 * pinned by unit tests; any drift will fail CI.
 */
export function sanitizeUrl(url) {
  if (typeof url !== "string" || url.length === 0) {
    throw new TypeError("sanitizeUrl: url must be a non-empty string");
  }
  return url
    .replace(/^https?:\/\//, "")
    .replace(/[^a-z0-9]/gi, "_")
    .toLowerCase();
}
