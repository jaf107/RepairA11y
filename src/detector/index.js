import { runNavA11y, readResults } from "./runNavA11y.js";
import { normalizeResults } from "./normalize.js";

export { DetectorError } from "./errors.js";
export { sanitizeUrl } from "./sanitizeUrl.js";
export { normalizeRecord, normalizeResults } from "./normalize.js";
export { runNavA11y, readResults } from "./runNavA11y.js";

/**
 * Run NavA11y against a URL or local HTML file and return normalized records.
 *
 * @param {object} opts
 * @param {string} [opts.url]         Remote URL
 * @param {string} [opts.htmlFile]    Local HTML file path
 * @param {string} [opts.navA11yDir]  Override NavA11y directory (default: ./nava11y)
 * @param {Function} [opts.spawn]     child_process.spawn replacement (tests)
 * @returns {Promise<{ violations: Array, reportDir: string, resultsPath: string, inputUrl: string, stdout: string, stderr: string }>}
 *
 * Throws DetectorError on subprocess failure, missing/invalid report, or
 * unrecognized record shape.
 */
export async function runDetection(opts = {}) {
  const runResult = await runNavA11y(opts);
  const raw = await readResults(runResult.resultsPath);
  const violations = normalizeResults(raw);
  return { ...runResult, violations };
}
