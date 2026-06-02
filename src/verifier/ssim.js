import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { readFile } from "node:fs/promises";

/**
 * Compare two PNG screenshots and return a similarity report.
 *
 * Note: "ssim" is colloquial here — we actually use a pixel-diff via pixelmatch
 * (faster, no external deps, good enough for "did the page change a lot"
 * heuristics). True SSIM can be plugged in later by swapping this module.
 *
 * @param {string|Buffer} a  baseline PNG (path or buffer)
 * @param {string|Buffer} b  candidate PNG (path or buffer)
 * @param {object} [opts]
 * @param {number} [opts.threshold]  per-pixel difference tolerance (0..1, default 0.1)
 * @returns {Promise<{ similarity: number, diffPixels: number, totalPixels: number, width: number, height: number }>}
 *   similarity ∈ [0,1] — higher is more similar.
 */
export async function compareScreenshots(a, b, opts = {}) {
  const { threshold = 0.1 } = opts;
  const [bufA, bufB] = await Promise.all([toBuffer(a), toBuffer(b)]);
  const pngA = PNG.sync.read(bufA);
  const pngB = PNG.sync.read(bufB);

  if (pngA.width !== pngB.width || pngA.height !== pngB.height) {
    // Resize-tolerant fallback: report similarity = 0 if dimensions differ.
    return {
      similarity: 0,
      diffPixels:
        Math.max(pngA.width, pngB.width) * Math.max(pngA.height, pngB.height),
      totalPixels:
        Math.max(pngA.width, pngB.width) * Math.max(pngA.height, pngB.height),
      width: Math.max(pngA.width, pngB.width),
      height: Math.max(pngA.height, pngB.height),
      mismatchedDimensions: true,
    };
  }

  const { width, height } = pngA;
  const diff = new PNG({ width, height });
  const diffPixels = pixelmatch(
    pngA.data,
    pngB.data,
    diff.data,
    width,
    height,
    { threshold },
  );

  const totalPixels = width * height;
  return {
    similarity: 1 - diffPixels / totalPixels,
    diffPixels,
    totalPixels,
    width,
    height,
  };
}

async function toBuffer(input) {
  if (Buffer.isBuffer(input)) return input;
  return readFile(input);
}
