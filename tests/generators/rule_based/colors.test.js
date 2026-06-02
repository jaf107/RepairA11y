import { describe, it, expect } from "vitest";
import {
  parseColor,
  contrastRatio,
  adjustColorForContrast,
  toHex,
} from "../../../src/generators/rule_based/_utils/colors.js";

describe("parseColor", () => {
  it("parses #rrggbb", () => {
    expect(parseColor("#ff0000")).toMatchObject({ r: 255, g: 0, b: 0 });
  });
  it("parses #rgb shorthand", () => {
    expect(parseColor("#f00")).toMatchObject({ r: 255, g: 0, b: 0 });
  });
  it("parses rgb(...)", () => {
    expect(parseColor("rgb(153, 153, 153)")).toMatchObject({
      r: 153,
      g: 153,
      b: 153,
    });
  });
  it("parses rgba(...) with alpha", () => {
    const c = parseColor("rgba(0, 0, 0, 0.5)");
    expect(c).toMatchObject({ r: 0, g: 0, b: 0, a: 0.5 });
  });
  it("parses named colors", () => {
    expect(parseColor("white")).toMatchObject({ r: 255, g: 255, b: 255 });
  });
  it("returns null for transparent", () => {
    expect(parseColor("transparent")).toBe(null);
  });
  it("returns null for garbage", () => {
    expect(parseColor("hello")).toBe(null);
  });
});

describe("contrastRatio", () => {
  it("black on white = 21:1", () => {
    const r = contrastRatio(parseColor("#000"), parseColor("#fff"));
    expect(r).toBeCloseTo(21, 1);
  });
  it("#999 on #fff ≈ 2.85:1 (below SC 2.4.13 minimum)", () => {
    const r = contrastRatio(parseColor("#999"), parseColor("#fff"));
    expect(r).toBeGreaterThan(2.7);
    expect(r).toBeLessThan(3.0);
  });
  it("#767676 on #fff ≥ 4.5:1 (matches ground-truth choice)", () => {
    const r = contrastRatio(parseColor("#767676"), parseColor("#fff"));
    expect(r).toBeGreaterThanOrEqual(4.5);
  });
});

describe("adjustColorForContrast", () => {
  it("nudges #999 (gray) on white to ≥3:1", () => {
    const target = parseColor("#999");
    const bg = parseColor("#ffffff");
    const fixed = adjustColorForContrast(target, bg, 3.0);
    expect(fixed).toBeTruthy();
    expect(contrastRatio(fixed, bg)).toBeGreaterThanOrEqual(3.0);
  });
  it("already-passing color returns a still-passing color", () => {
    const target = parseColor("#222");
    const bg = parseColor("#fff");
    const fixed = adjustColorForContrast(target, bg, 3.0);
    expect(fixed).toBeTruthy();
    expect(contrastRatio(fixed, bg)).toBeGreaterThanOrEqual(3.0);
  });
});

describe("toHex", () => {
  it("formats rgb to #rrggbb", () => {
    expect(toHex({ r: 118, g: 118, b: 118 })).toBe("#767676");
  });
});
