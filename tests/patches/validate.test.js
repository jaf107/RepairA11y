import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { validatePatch } from "../../src/patches/validate.js";
import { ApplierError } from "../../src/patches/errors.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");

function load(rel) {
  return JSON.parse(readFileSync(join(repoRoot, rel), "utf8"));
}

describe("validatePatch", () => {
  it("accepts all 3 ground-truth patches", () => {
    for (const rel of [
      "ground-truth/sc-2.4.13-focus-appearance-outline-contrast.json",
      "ground-truth/sc-2.4.11-focus-obscured-by-fixed-footer.json",
      "ground-truth/sc-2.4.3-positive-tabindex.json",
    ]) {
      const { patch } = load(rel);
      expect(validatePatch(patch)).toBe(true);
    }
  });

  it("throws ApplierError on invalid patch", () => {
    expect(() =>
      validatePatch({
        patch_type: "bogus",
        target_selector: "x",
        payload: {},
        rationale: "x",
        wcag_technique_cited: null,
      }),
    ).toThrow(ApplierError);
  });

  it("throws ApplierError on css_inject missing rule", () => {
    expect(() =>
      validatePatch({
        patch_type: "css_inject",
        target_selector: "button",
        payload: {},
        rationale: "x",
        wcag_technique_cited: null,
      }),
    ).toThrow(/schema validation/i);
  });
});
