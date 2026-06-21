/**
 * Screenshot utilities for showcase / D_r experiment output.
 *
 * annotateWithBbox: draws a red rectangle over an existing PNG (used by E4 evidence).
 * captureBeforeAfter: focuses a selector, crops to element bounds, applies mutation,
 *   re-focuses, crops again. Shows :focus-visible state before/after the patch.
 *
 * Sharp is lazy-loaded so E1–E3 paths pay no import cost.
 */

function normalizeBbox(bbox) {
  return {
    x: bbox.x ?? bbox.left ?? 0,
    y: bbox.y ?? bbox.top ?? 0,
    width: bbox.width ?? (bbox.right - bbox.left),
    height: bbox.height ?? (bbox.bottom - bbox.top),
  };
}

async function addRedBorder(input, outputPath) {
  const sharp = (await import("sharp")).default;
  const meta = await sharp(input).metadata();
  const overlay = Buffer.from(
    `<svg width="${meta.width}" height="${meta.height}">` +
      `<rect x="2" y="2" width="${meta.width - 4}" height="${meta.height - 4}" ` +
      `fill="none" stroke="red" stroke-width="3"/>` +
      `</svg>`,
  );
  await sharp(input)
    .composite([{ input: overlay, top: 0, left: 0 }])
    .png()
    .toFile(outputPath);
}

/**
 * Draw a 3px red rectangle at `bbox` over `inputPath` and write to `outputPath`.
 * Used by E4 evidence annotator (full-page screenshot + element bbox overlay).
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
 * Capture focused element before/after a patch mutation.
 *
 * Focuses `selector`, screenshots just that element (crop via Playwright locator),
 * annotates with red border, applies mutation, re-focuses, screenshots again.
 * This reveals the :focus-visible state that the patch is designed to fix.
 *
 * @param {object} opts
 * @param {import("playwright").Page} opts.page
 * @param {string}   opts.selector   CSS selector for the violating element
 * @param {string}   opts.beforePath Path for pre-patch screenshot
 * @param {string}   opts.afterPath  Path for post-patch screenshot
 * @param {Function} opts.applyFn    Async function that mutates the page (receives page)
 * @returns {Promise<{ beforePath: string, afterPath: string }>}
 */
export async function captureBeforeAfter({ page, selector, beforePath, afterPath, applyFn }) {
  const locator = page.locator(selector).first();

  await locator.scrollIntoViewIfNeeded();
  await locator.focus();
  await page.waitForTimeout(150);
  const beforeBuf = await locator.screenshot();
  await addRedBorder(beforeBuf, beforePath);

  await applyFn(page);

  await locator.scrollIntoViewIfNeeded();
  await locator.focus();
  await page.waitForTimeout(150);
  const afterBuf = await locator.screenshot();
  await addRedBorder(afterBuf, afterPath);

  return { beforePath, afterPath };
}
