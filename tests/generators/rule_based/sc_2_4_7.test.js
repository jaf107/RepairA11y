import { describe, it, expect } from "vitest";
import { generate } from "../../../src/generators/rule_based/sc_2_4_7.js";
import { validatePatch } from "../../../src/patches/validate.js";

const v = (overrides = {}) => ({
  id: "v1",
  sc: "2.4.7",
  result: "FAIL",
  element: { selector: "button.no-focus" },
  evidence: {},
  ...overrides,
});

describe("rule-based sc_2_4_7", () => {
  it("injects outline when no visible indicator detected", () => {
    const patch = generate({
      violation: v({
        evidence: {
          styleSnapshots: {
            before: {
              outlineWidth: "0px",
              outlineColor: "rgba(0,0,0,0)",
              borderTopColor: "rgb(204,204,204)",
              backgroundColor: "rgb(255,255,255)",
              boxShadow: "none",
            },
            after: {
              outlineWidth: "0px",
              outlineColor: "rgba(0,0,0,0)",
              borderTopColor: "rgb(204,204,204)",
              backgroundColor: "rgb(255,255,255)",
              boxShadow: "none",
            },
          },
        },
      }),
    });
    expect(patch).not.toBeNull();
    expect(patch.payload.rule).toMatch(/outline: 2px solid/);
    expect(patch.wcag_technique_cited).toBe("C15");
    validatePatch(patch);
  });

  it("adjusts low-contrast outline color", () => {
    const patch = generate({
      violation: v({
        evidence: {
          styleSnapshots: {
            after: {
              outlineWidth: "2px",
              outlineColor: "rgb(153, 153, 153)",
              backgroundColor: "rgb(255,255,255)",
            },
          },
        },
      }),
    });
    expect(patch).not.toBeNull();
    expect(patch.payload.rule).toMatch(/outline-color/);
    validatePatch(patch);
  });

  it("returns null when a visible indicator exists with good contrast", () => {
    const patch = generate({
      violation: v({
        evidence: {
          styleSnapshots: {
            after: {
              outlineWidth: "2px",
              outlineColor: "rgb(0, 0, 0)",
              backgroundColor: "rgb(255,255,255)",
            },
          },
        },
      }),
    });
    expect(patch).toBe(null);
  });
});
