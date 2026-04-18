import { DetectorError } from "./errors.js";

const VALID_SCS = new Set(["2.4.3", "2.4.7", "2.4.11", "2.4.12", "2.4.13"]);
const VALID_RESULTS = new Set(["FAIL", "PASS", "REVIEW"]);
const VALID_CHECK_TYPES = new Set(["element-level", "page-level"]);

/**
 * Normalize one NavA11y results.json record into RepairA11y's internal shape.
 *
 * Design goals:
 *  - Passthrough `evidence` as-is (new Track B fields — styleSnapshots,
 *    obscurers, positiveTabindexElements — appear verbatim to downstream
 *    Stage 2 packagers).
 *  - Preserve the full original record under `raw` for forward-compat with
 *    future NavA11y schema additions.
 *  - Synthesize a stable id for page-level records missing `id`.
 */
export function normalizeRecord(record) {
  if (record === null || typeof record !== "object") {
    throw new DetectorError(
      `normalizeRecord: record must be an object, got ${record === null ? "null" : typeof record}`,
    );
  }

  const { sc, result, checkType, reason, evidence, element, screenshot, id } =
    record;

  if (!VALID_SCS.has(sc)) {
    throw new DetectorError(
      `normalizeRecord: unknown sc '${sc}' (expected one of ${[...VALID_SCS].join(", ")})`,
    );
  }
  if (!VALID_RESULTS.has(result)) {
    throw new DetectorError(
      `normalizeRecord: unknown result '${result}' (expected one of ${[...VALID_RESULTS].join(", ")})`,
    );
  }
  if (!VALID_CHECK_TYPES.has(checkType)) {
    throw new DetectorError(
      `normalizeRecord: unknown checkType '${checkType}' (expected one of ${[...VALID_CHECK_TYPES].join(", ")})`,
    );
  }

  return {
    id: id ?? `page:${sc}`,
    sc,
    result,
    checkType,
    reason: typeof reason === "string" ? reason : "",
    evidence: evidence ?? {},
    element: element ?? null,
    screenshot: screenshot ?? null,
    raw: record,
  };
}

/**
 * Normalize a full results.json array. Validates top-level shape.
 */
export function normalizeResults(results) {
  if (!Array.isArray(results)) {
    throw new DetectorError(
      `normalizeResults: results must be an array, got ${typeof results}`,
    );
  }
  return results.map((r, i) => {
    try {
      return normalizeRecord(r);
    } catch (error) {
      if (error instanceof DetectorError) {
        throw new DetectorError(
          `normalizeResults: record at index ${i} failed validation — ${error.message}`,
          { cause: error },
        );
      }
      throw error;
    }
  });
}
