import { describe, it, expect } from "vitest";
import { generate } from "../../../src/generators/rule_based/sc_2_4_13.js";
import { validatePatch } from "../../../src/patches/validate.js";

const baseViolation = (overrides = {}) => ({
  id: "v1",
  sc: "2.4.13",
  result: "FAIL",
  element: { selector: "button.aaa-outline" },
  evidence: {},
  ...overrides,
});

describe("rule-based sc_2_4_13", () => {
  it("contrast-fix branch: low-contrast outline yields valid css_inject", () => {
    const patch = generate({
      violation: baseViolation({
        evidence: {
          styleSnapshots: {
            after: {
              outlineWidth: "2px",
              outlineColor: "rgb(153, 153, 153)",
              backgroundColor: "rgb(255, 255, 255)",
            },
          },
        },
      }),
    });
    expect(patch).not.toBeNull();
    expect(patch.patch_type).toBe("css_inject");
    expect(patch.payload.rule).toMatch(/:focus\b/);
    expect(patch.payload.rule).toMatch(/outline-color/);
    validatePatch(patch);
  });

  it("no-outline branch: missing outline yields full :focus-visible rule", () => {
    const patch = generate({
      violation: baseViolation({
        evidence: {
          styleSnapshots: {
            after: {
              outlineWidth: "0px",
              outlineColor: "rgba(0, 0, 0, 0)",
              backgroundColor: "rgb(255, 255, 255)",
            },
          },
        },
      }),
    });
    expect(patch).not.toBeNull();
    expect(patch.payload.rule).toMatch(/outline: 2px solid #000000/);
    expect(patch.wcag_technique_cited).toBe("C27");
  });

  it("catch-all branch fires when outline passes but NavA11y still flagged FAIL (border/bg case)", () => {
    // SC 2.4.13 can fail due to border or background indicator deficiencies
    // even when the outline appears passing. The generator falls back to
    // injecting an explicit outline as a universal fix.
    const patch = generate({
      violation: baseViolation({
        evidence: {
          styleSnapshots: {
            after: {
              outlineWidth: "3px",
              outlineColor: "rgb(0, 0, 0)",
              backgroundColor: "rgb(255, 255, 255)",
            },
          },
        },
      }),
    });
    expect(patch).not.toBeNull();
    expect(patch.payload.rule).toMatch(/outline: 2px solid/);
    expect(patch.wcag_technique_cited).toBe("C27");
  });

  it("returns null for non-2.4.13 SCs", () => {
    const patch = generate({
      violation: baseViolation({ sc: "2.4.11" }),
    });
    expect(patch).toBe(null);
  });

  it("returns null for PASS records", () => {
    const patch = generate({
      violation: baseViolation({ result: "PASS" }),
    });
    expect(patch).toBe(null);
  });
});
