import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  normalizeRecord,
  normalizeResults,
} from "../../src/detector/normalize.js";
import { DetectorError } from "../../src/detector/errors.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");

function loadJson(relativePath) {
  return JSON.parse(readFileSync(join(repoRoot, relativePath), "utf8"));
}

describe("normalizeRecord", () => {
  it("passes through evidence untouched", () => {
    const record = {
      sc: "2.4.13",
      result: "FAIL",
      checkType: "element-level",
      reason: "contrast below 3:1",
      evidence: { measurements: { outlineWidth: 1 }, someNewKey: "x" },
      id: "abc",
    };
    const out = normalizeRecord(record);
    expect(out.evidence).toEqual(record.evidence);
    expect(out.evidence).toBe(record.evidence);
  });

  it("synthesizes id for page-level records missing id", () => {
    const record = {
      sc: "2.4.3",
      result: "PASS",
      checkType: "page-level",
      reason: "ok",
      evidence: {},
    };
    expect(normalizeRecord(record).id).toBe("page:2.4.3");
  });

  it("preserves the full original record under `raw`", () => {
    const record = {
      sc: "2.4.13",
      result: "FAIL",
      checkType: "element-level",
      reason: "r",
      evidence: {},
      futureTopLevelField: "keep me",
    };
    expect(normalizeRecord(record).raw).toBe(record);
    expect(normalizeRecord(record).raw.futureTopLevelField).toBe("keep me");
  });

  it("defaults missing element and screenshot to null", () => {
    const record = {
      sc: "2.4.3",
      result: "REVIEW",
      checkType: "page-level",
      reason: "r",
      evidence: {},
      id: "p",
    };
    const out = normalizeRecord(record);
    expect(out.element).toBeNull();
    expect(out.screenshot).toBeNull();
  });

  it("rejects unknown sc values", () => {
    expect(() =>
      normalizeRecord({
        sc: "9.9.9",
        result: "FAIL",
        checkType: "element-level",
      }),
    ).toThrow(DetectorError);
  });

  it("rejects unknown result values", () => {
    expect(() =>
      normalizeRecord({
        sc: "2.4.7",
        result: "MAYBE",
        checkType: "element-level",
      }),
    ).toThrow(DetectorError);
  });
});

describe("normalizeResults — Qualtrics fixture (pre Track-B merge)", () => {
  const results = loadJson("nava11y/reports/www_qualtrics_com/results.json");

  it("loads without throwing and preserves record count", () => {
    const normalized = normalizeResults(results);
    expect(normalized).toHaveLength(results.length);
  });

  it("returns at least one FAIL record", () => {
    const normalized = normalizeResults(results);
    expect(normalized.some((r) => r.result === "FAIL")).toBe(true);
  });

  it("marks page-level records with checkType 'page-level'", () => {
    const normalized = normalizeResults(results);
    const pageLevel = normalized.filter((r) => r.checkType === "page-level");
    expect(pageLevel.length).toBeGreaterThan(0);
    expect(pageLevel.every((r) => r.sc === "2.4.3")).toBe(true);
  });

  it("preserves existing evidence shape for FAIL records", () => {
    const normalized = normalizeResults(results);
    const fail = normalized.find((r) => r.result === "FAIL");
    expect(fail.evidence).toBeTypeOf("object");
    expect(fail.raw).toBeDefined();
  });
});

describe("normalizeResults — forward-compat fixture", () => {
  const results = loadJson("tests/fixtures/results-forward-compat.json");

  it("accepts records with unknown top-level and evidence keys", () => {
    const normalized = normalizeResults(results);
    expect(normalized).toHaveLength(2);
  });

  it("preserves unknown top-level fields under raw", () => {
    const [first] = normalizeResults(results);
    expect(first.raw.futureTopLevelField).toBe("should survive under raw");
  });

  it("passes through styleSnapshots and unknown evidence keys verbatim", () => {
    const [first] = normalizeResults(results);
    expect(first.evidence.styleSnapshots).toEqual({
      before: { outlineWidth: 0 },
      after: { outlineWidth: 2 },
    });
    expect(first.evidence.someUnknownFutureKey).toEqual({ nested: "data" });
  });

  it("reports array index when a record is malformed", () => {
    const bad = [...results, { sc: "9.9.9", result: "FAIL", checkType: "x" }];
    try {
      normalizeResults(bad);
      throw new Error("expected normalizeResults to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(DetectorError);
      expect(error.message).toMatch(/index 2/);
    }
  });
});
