import { describe, it, expect } from "vitest";
import {
  aggregate,
  renderAggregateMarkdown,
} from "../../src/reporting/aggregate.js";
import { renderPerCaseMarkdown } from "../../src/reporting/per_case.js";

const sample = [
  {
    caseId: "c1",
    sc: "2.4.13",
    status: "RESOLVED",
    iterations: 1,
    verify: { targetResolved: true, newFailureCount: 0, similarity: 0.97 },
    generator: "rule_based",
    evidenceLevel: "E1",
  },
  {
    caseId: "c2",
    sc: "2.4.13",
    status: "UNRESOLVED",
    iterations: 3,
    verify: { targetResolved: false, newFailureCount: 0, similarity: 0.99 },
    generator: "llm_based",
    evidenceLevel: "E3",
  },
  {
    caseId: "c3",
    sc: "2.4.11",
    status: "REGRESSED",
    iterations: 1,
    verify: { targetResolved: false, newFailureCount: 2, similarity: 0.88 },
    generator: "rule_based",
    evidenceLevel: "E1",
  },
];

describe("aggregate", () => {
  it("produces overall counts and rates", () => {
    const s = aggregate(sample);
    expect(s.total).toBe(3);
    expect(s.resolved).toBe(1);
    expect(s.byStatus.RESOLVED).toBe(1);
    expect(s.byStatus.UNRESOLVED).toBe(1);
    expect(s.byStatus.REGRESSED).toBe(1);
    expect(s.resolutionRate).toBeCloseTo(1 / 3, 5);
  });

  it("groups by SC, generator, evidence level", () => {
    const s = aggregate(sample);
    expect(s.bySC["2.4.13"].total).toBe(2);
    expect(s.byGenerator.rule_based.total).toBe(2);
    expect(s.byEvidenceLevel.E1.total).toBe(2);
  });

  it("mean iterations and similarity computed", () => {
    const s = aggregate(sample);
    expect(s.meanIterations).toBeCloseTo((1 + 3 + 1) / 3, 5);
    expect(s.meanSimilarity).toBeCloseTo((0.97 + 0.99 + 0.88) / 3, 5);
  });
});

describe("renderAggregateMarkdown", () => {
  it("returns paper-ready markdown", () => {
    const md = renderAggregateMarkdown(aggregate(sample), {
      experiment: "rq2-smoke",
    });
    expect(md).toMatch(/# Experiment report/);
    expect(md).toMatch(/By status/);
    expect(md).toMatch(/2\.4\.13/);
    expect(md).toMatch(/rule_based/);
    expect(md).toMatch(/E1/);
  });
});

describe("renderPerCaseMarkdown", () => {
  it("renders patch JSON when present", () => {
    const md = renderPerCaseMarkdown({
      violation: {
        id: "v1",
        sc: "2.4.13",
        element: { selector: "button" },
        reason: "low contrast",
      },
      patch: { patch_type: "css_inject" },
      verify: { targetResolved: true, newFailureCount: 0, similarity: 0.99 },
      status: "RESOLVED",
      iterations: 1,
    });
    expect(md).toMatch(/RESOLVED/);
    expect(md).toMatch(/css_inject/);
    expect(md).toMatch(/0\.990/);
  });
});
