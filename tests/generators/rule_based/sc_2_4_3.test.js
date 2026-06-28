import { describe, it, expect } from "vitest";
import { generate } from "../../../src/generators/rule_based/sc_2_4_3.js";
import { validatePatch } from "../../../src/patches/validate.js";

const violationWith = (violations, extra = {}) => ({
  id: "page:2.4.3",
  sc: "2.4.3",
  result: "FAIL",
  element: null,
  evidence: { violations, ...extra },
});

describe("rule-based sc_2_4_3", () => {
  it("resets a single positive-tabindex offender via attr_set", () => {
    const v = violationWith([
      {
        type: "positive-tabindex",
        elements: [{ selector: "a.nav", tabIndex: 3 }],
      },
    ]);
    const patch = generate({ violation: v });
    expect(patch).not.toBeNull();
    expect(patch.patch_type).toBe("attr_set");
    expect(patch.target_selector).toBe("a.nav");
    expect(patch.payload).toEqual({ attribute: "tabindex", value: "0" });
    expect(patch.wcag_technique_cited).toBe("F44");
    validatePatch(patch);
  });

  it("resets multiple offenders via attr_set_all with joined selectors", () => {
    const v = violationWith([
      {
        type: "positive-tabindex",
        elements: [
          { selector: "a.one", tabIndex: 2 },
          { selector: "a.two", tabIndex: 5 },
        ],
      },
    ]);
    const patch = generate({ violation: v });
    expect(patch.patch_type).toBe("attr_set_all");
    expect(patch.target_selector).toBe("a.one, a.two");
    expect(patch.payload).toEqual({ attribute: "tabindex", value: "0" });
    validatePatch(patch);
  });

  it("falls back to evidence.positiveTabindexElements", () => {
    const v = violationWith(
      [{ type: "focus-trap", elements: ["x"] }],
      { positiveTabindexElements: [{ selector: "#a", tabIndex: 4 }] },
    );
    const patch = generate({ violation: v });
    expect(patch.patch_type).toBe("attr_set");
    expect(patch.target_selector).toBe("#a");
  });

  it("derives offenders from tabSequence when no structured block", () => {
    const v = violationWith(undefined, {
      tabSequence: [
        { selector: "#a", tabIndex: 0 },
        { selector: "#b", tabIndex: 7 },
      ],
    });
    const patch = generate({ violation: v });
    expect(patch.target_selector).toBe("#b");
  });

  it("declines (null) when only non-tabindex violations present", () => {
    const v = violationWith([
      { type: "focus-trap", elements: ["#x"] },
      { type: "visual-order-mismatch", divergence: "40.0" },
    ]);
    expect(generate({ violation: v })).toBeNull();
  });

  it("returns null for non-2.4.3 or non-FAIL", () => {
    expect(generate({ violation: { sc: "2.4.7", result: "FAIL" } })).toBeNull();
    expect(
      generate({ violation: { sc: "2.4.3", result: "PASS", evidence: {} } }),
    ).toBeNull();
  });
});
