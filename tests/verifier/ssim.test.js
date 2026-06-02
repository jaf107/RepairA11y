import { describe, it, expect } from "vitest";
import { PNG } from "pngjs";
import { compareScreenshots } from "../../src/verifier/ssim.js";

function solid(width, height, [r, g, b]) {
  const png = new PNG({ width, height });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = r;
    png.data[i + 1] = g;
    png.data[i + 2] = b;
    png.data[i + 3] = 255;
  }
  return PNG.sync.write(png);
}

describe("compareScreenshots", () => {
  it("identical images have similarity 1", async () => {
    const a = solid(40, 40, [128, 128, 128]);
    const b = solid(40, 40, [128, 128, 128]);
    const r = await compareScreenshots(a, b);
    expect(r.similarity).toBeCloseTo(1, 5);
    expect(r.diffPixels).toBe(0);
  });

  it("very different images have similarity near 0", async () => {
    const a = solid(40, 40, [0, 0, 0]);
    const b = solid(40, 40, [255, 255, 255]);
    const r = await compareScreenshots(a, b);
    expect(r.similarity).toBeLessThan(0.1);
  });

  it("mismatched dimensions flagged and similarity = 0", async () => {
    const a = solid(20, 20, [0, 0, 0]);
    const b = solid(40, 40, [0, 0, 0]);
    const r = await compareScreenshots(a, b);
    expect(r.mismatchedDimensions).toBe(true);
    expect(r.similarity).toBe(0);
  });
});
