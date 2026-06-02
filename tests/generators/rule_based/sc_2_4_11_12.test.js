import { describe, it, expect } from "vitest";
import { generate as gen11 } from "../../../src/generators/rule_based/sc_2_4_11.js";
import { generate as gen12 } from "../../../src/generators/rule_based/sc_2_4_12.js";
import { validatePatch } from "../../../src/patches/validate.js";

const obscuredViolation = (sc) => ({
  id: "v1",
  sc,
  result: "FAIL",
  element: { selector: "button.footer-btn" },
  evidence: {
    obscuredRatio: 0.8,
    obscuredBy: [".fixed-footer"],
    obscurers: [
      { selector: ".fixed-footer", zIndex: "100", position: "fixed" },
    ],
  },
});

describe("rule-based sc_2_4_11", () => {
  it("raises z-index above max obscurer", () => {
    const patch = gen11({ violation: obscuredViolation("2.4.11") });
    expect(patch).not.toBeNull();
    expect(patch.patch_type).toBe("css_inject");
    expect(patch.payload.rule).toMatch(/z-index: 150/);
    expect(patch.payload.rule).toMatch(/position: relative/);
    validatePatch(patch);
  });

  it("uses default z-index when obscurer data missing", () => {
    const v = obscuredViolation("2.4.11");
    v.evidence = { obscuredBy: [".unknown"] };
    const patch = gen11({ violation: v });
    expect(patch).not.toBeNull();
    expect(patch.payload.rule).toMatch(/z-index: 150/);
  });

  it("returns null for non-2.4.11", () => {
    expect(gen11({ violation: obscuredViolation("2.4.7") })).toBe(null);
  });
});

describe("rule-based sc_2_4_12", () => {
  it("uses strict (larger) buffer above obscurer", () => {
    const patch = gen12({ violation: obscuredViolation("2.4.12") });
    expect(patch).not.toBeNull();
    expect(patch.payload.rule).toMatch(/z-index: 200/);
    validatePatch(patch);
  });

  it("returns null for non-2.4.12", () => {
    expect(gen12({ violation: obscuredViolation("2.4.11") })).toBe(null);
  });
});
