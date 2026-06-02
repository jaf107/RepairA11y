import { describe, it, expect } from "vitest";
import { diffViolations } from "../../src/verifier/diff.js";

const v = (id, sc, result, selector) => ({
  id,
  sc,
  result,
  element: { selector },
});

describe("diffViolations", () => {
  it("identifies resolved + still-failing + new failures (by sc+selector)", () => {
    // NavA11y reassigns UUIDs each run — use distinct ids on each side
    // for the same conceptual violation to mirror reality.
    const baseline = [
      v("a-old", "2.4.13", "FAIL", "button.x"),
      v("b-old", "2.4.11", "FAIL", "button.y"),
      v("c-old", "2.4.7", "PASS", "button.z"),
    ];
    const post = [
      v("b-new", "2.4.11", "FAIL", "button.y"), // same selector → matches b-old
      v("d-new", "2.4.13", "FAIL", "button.new"),
      v("c-new", "2.4.7", "PASS", "button.z"),
    ];

    const delta = diffViolations(baseline, post);
    expect(delta.resolved.map((r) => r.element.selector)).toEqual(["button.x"]);
    expect(delta.stillFailing.map((r) => r.element.selector)).toEqual([
      "button.y",
    ]);
    expect(delta.newFailures.map((r) => r.element.selector)).toEqual([
      "button.new",
    ]);
  });

  it("targetResolved is true when target's (sc,selector) is in resolved", () => {
    const baseline = [v("a", "2.4.13", "FAIL", "x")];
    const post = [];
    const delta = diffViolations(baseline, post, { targetId: "2.4.13:x" });
    expect(delta.targetResolved).toBe(true);
  });

  it("targetResolved is false when target still fails", () => {
    const baseline = [v("a", "2.4.13", "FAIL", "x")];
    const post = [v("a-new", "2.4.13", "FAIL", "x")];
    const delta = diffViolations(baseline, post, { targetId: "2.4.13:x" });
    expect(delta.targetResolved).toBe(false);
  });

  it("scFilter restricts diff scope", () => {
    const baseline = [
      v("a", "2.4.13", "FAIL", "x"),
      v("b", "2.4.7", "FAIL", "y"),
    ];
    const post = [v("a-new", "2.4.13", "FAIL", "x")];
    const delta = diffViolations(baseline, post, { scFilter: "2.4.7" });
    expect(delta.resolved.map((r) => r.element.selector)).toEqual(["y"]);
    expect(delta.newFailures).toHaveLength(0);
  });

  it("works when ids missing entirely (canonical key is sc+selector)", () => {
    const baseline = [
      { sc: "2.4.13", result: "FAIL", element: { selector: "button.x" } },
    ];
    const post = [];
    const delta = diffViolations(baseline, post);
    expect(delta.resolved).toHaveLength(1);
  });
});
