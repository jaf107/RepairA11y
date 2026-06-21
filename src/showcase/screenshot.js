/**
 * Screenshot annotation utilities for showcase / D_r experiment output.
 *
 * annotateWithBbox: draws a red rectangle over an existing PNG and writes to outputPath.
 * captureBeforeAfter: takes before/after screenshots around a mutation, annotates both.
 *
 * Sharp is lazy-loaded so E1–E3 paths that never call these functions pay no import cost.
 */

function normalizeBbox(bbox) {
  return {
    x: bbox.x ?? bbox.left ?? 0,
    y: bbox.y ?? bbox.top ?? 0,
    width: bbox.width ?? (bbox.right - bbox.left),
    height: bbox.height ?? (bbox.bottom - bbox.top),
  };
}

/**
 * Draw a 3px red rectangle at `bbox` over `inputPath` and write to `outputPath`.
 *
 * @param {object} opts
 * @param {string} opts.inputPath   Source PNG path
 * @param {object} opts.bbox        { x, y, width, height } or { left, top, right, bottom }
 * @param {string} opts.outputPath  Destination PNG path (may equal inputPath for in-place)
 */
export async function annotateWithBbox({ inputPath, bbox, outputPath }) {
  const sharp = (await import("sharp")).default;
  const { x, y, width, height } = normalizeBbox(bbox);
  const meta = await sharp(inputPath).metadata();

  const overlay = Buffer.from(
    `<svg width="${meta.width}" height="${meta.height}">` +
      `<rect x="${Math.round(x)}" y="${Math.round(y)}" ` +
      `width="${Math.round(width)}" height="${Math.round(height)}" ` +
      `fill="none" stroke="red" stroke-width="3"/>` +
      `</svg>`,
  );

  await sharp(inputPath)
    .composite([{ input: overlay, top: 0, left: 0 }])
    .png()
    .toFile(outputPath);
}

/**
 * Capture before/after screenshots around `applyFn`, annotating both with `bbox`.
 *
 * @param {object} opts
 * @param {import("playwright").Page} opts.page
 * @param {object}   opts.bbox        Bounding box to annotate
 * @param {string}   opts.beforePath  Path for pre-mutation screenshot
 * @param {string}   opts.afterPath   Path for post-mutation screenshot
 * @param {Function} opts.applyFn     Async function that mutates the page
 * @returns {Promise<{ beforePath: string, afterPath: string }>}
 */
export async function captureBeforeAfter({ page, bbox, beforePath, afterPath, applyFn }) {
  await page.screenshot({ path: beforePath, fullPage: true });
  await annotateWithBbox({ inputPath: beforePath, bbox, outputPath: beforePath });

  await applyFn(page);

  await page.screenshot({ path: afterPath, fullPage: true });
  await annotateWithBbox({ inputPath: afterPath, bbox, outputPath: afterPath });

  return { beforePath, afterPath };
}
