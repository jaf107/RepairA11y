import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readResults } from "../../src/detector/runNavA11y.js";
import { normalizeResults } from "../../src/detector/normalize.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const qualtricsResults = join(
  repoRoot,
  "nava11y/reports/www_qualtrics_com/results.json",
);

/**
 * End-to-end minus the subprocess: read the cached Qualtrics results.json and
 * normalize it, mimicking the path runDetection() takes after the NavA11y run
 * finishes. Gives us real-world shape coverage without a 60s Playwright run.
 */
describe("detector — Qualtrics cached fixture integration", () => {
  it("normalizes every record and surfaces at least one FAIL", async () => {
    const raw = await readResults(qualtricsResults);
    const violations = normalizeResults(raw);
    expect(violations.length).toBeGreaterThan(100);
    const fails = violations.filter((v) => v.result === "FAIL");
    expect(fails.length).toBeGreaterThanOrEqual(1);
  });

  it("preserves per-SC distribution", async () => {
    const raw = await readResults(qualtricsResults);
    const violations = normalizeResults(raw);
    const bySC = violations.reduce((acc, v) => {
      acc[v.sc] = (acc[v.sc] || 0) + 1;
      return acc;
    }, {});
    for (const sc of ["2.4.3", "2.4.7", "2.4.11", "2.4.12", "2.4.13"]) {
      expect(bySC[sc]).toBeGreaterThan(0);
    }
  });

  it("element-level records carry a non-null element metadata block", async () => {
    const raw = await readResults(qualtricsResults);
    const violations = normalizeResults(raw);
    const elementLevel = violations.filter(
      (v) => v.checkType === "element-level",
    );
    expect(elementLevel.length).toBeGreaterThan(0);
    expect(elementLevel.every((v) => v.element !== null)).toBe(true);
  });

  it("page-level records synthesize stable ids when NavA11y omits them", async () => {
    const raw = await readResults(qualtricsResults);
    const violations = normalizeResults(raw);
    const pageLevel = violations.filter((v) => v.checkType === "page-level");
    expect(pageLevel.length).toBeGreaterThan(0);
    for (const v of pageLevel) {
      expect(v.id).toBeTruthy();
    }
  });
});
