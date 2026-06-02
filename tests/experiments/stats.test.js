import { describe, it, expect } from "vitest";
import { mcNemar, cohensH, mean, std } from "../../experiments/_common/stats.js";

describe("mcNemar", () => {
  it("no discordant pairs → p=1, not significant", () => {
    const a = [1, 1, 0, 0];
    const b = [1, 1, 0, 0];
    const r = mcNemar(a, b);
    expect(r.p).toBe(1);
    expect(r.significant).toBe(false);
  });

  it("strong shift in one direction → significant", () => {
    // 10 cases: a fails 9, b passes 9 (B improved on 9, A on 0).
    const a = Array(10).fill(0);
    const b = Array(10).fill(1);
    const r = mcNemar(a, b);
    expect(r.b).toBe(0);
    expect(r.c).toBe(10);
    expect(r.p).toBeLessThan(0.05);
    expect(r.significant).toBe(true);
  });

  it("throws when lengths differ", () => {
    expect(() => mcNemar([1], [1, 0])).toThrow(/same length/);
  });
});

describe("cohensH", () => {
  it("equal proportions → h=0", () => {
    expect(cohensH(0.5, 0.5)).toBeCloseTo(0, 8);
  });
  it("0.5 vs 1.0 returns medium-to-large", () => {
    const h = cohensH(1.0, 0.5);
    expect(h).toBeGreaterThan(0.5);
  });
});

describe("mean / std", () => {
  it("matches reference values", () => {
    expect(mean([1, 2, 3])).toBe(2);
    expect(std([1, 2, 3])).toBeCloseTo(1, 5);
  });
});
