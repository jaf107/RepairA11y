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

  // Live pages reflow between before/after captures (focus outline adds height,
  // lazy content settles), so full-page screenshots differ in dimensions. Rather
  // than report similarity=0 (a false REGRESSED), crop both to the common
  // top-left overlap region and compare that. The cropped fraction is reported
  // so callers can see how much was excluded.
  const dimMismatch =
    pngA.width !== pngB.width || pngA.height !== pngB.height;

  const width = Math.min(pngA.width, pngB.width);
  const height = Math.min(pngA.height, pngB.height);
  const dataA = dimMismatch ? cropTopLeft(pngA, width, height) : pngA.data;
  const dataB = dimMismatch ? cropTopLeft(pngB, width, height) : pngB.data;

  const diff = new PNG({ width, height });
  const diffPixels = pixelmatch(dataA, dataB, diff.data, width, height, {
    threshold,
  });

  const totalPixels = width * height;
  const comparedArea = width * height;
  const maxArea =
    Math.max(pngA.width, pngB.width) * Math.max(pngA.height, pngB.height);

  return {
    similarity: 1 - diffPixels / totalPixels,
    diffPixels,
    totalPixels,
    width,
    height,
    ...(dimMismatch
      ? {
          mismatchedDimensions: true,
          comparedFraction: comparedArea / maxArea,
        }
      : {}),
  };
}

/**
 * Extract the top-left (cropW × cropH) region of a PNG as a fresh RGBA buffer.
 */
function cropTopLeft(png, cropW, cropH) {
  const out = Buffer.alloc(cropW * cropH * 4);
  for (let y = 0; y < cropH; y++) {
    const srcStart = y * png.width * 4;
    const dstStart = y * cropW * 4;
    png.data.copy(out, dstStart, srcStart, srcStart + cropW * 4);
  }
  return out;
}

async function toBuffer(input) {
  if (Buffer.isBuffer(input)) return input;
  return readFile(input);
}
