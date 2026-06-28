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
 * Take a full-page screenshot of a patched HTML file with the repaired element
 * focused, and overlay a green "RESOLVED" badge matching NavA11y's red badge style.
 * Used when NavA11y has no after-screenshot (PASS records aren't screenshotted).
 *
 * @param {object} opts
 * @param {string} opts.htmlFile    Path to patched serialized HTML (from detectWithPatchLive)
 * @param {string} opts.selector    CSS selector of the repaired element
 * @param {string} opts.sc          WCAG SC string e.g. "2.4.13"
 * @param {string} opts.outputPath  Destination PNG
 */
export async function captureResolvedState({ htmlFile, selector, sc, outputPath }) {
  const { chromium } = await import("playwright");
  const sharp = (await import("sharp")).default;

  const browser = await chromium.launch();
  let buf;
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(`file://${htmlFile}`);
    await page.waitForLoadState("networkidle").catch(() => {});
    const loc = page.locator(selector).first();
    await loc.scrollIntoViewIfNeeded().catch(() => {});
    await loc.focus().catch(() => {});
    await page.waitForTimeout(150);
    // Crop to element — shows the focused state clearly, not the whole page.
    buf = await loc.screenshot({ timeout: 5000 }).catch(async () => {
      // Fallback to full-page if locator screenshot fails.
      return page.screenshot({ fullPage: false });
    });
    await ctx.close();
  } finally {
    await browser.close();
  }

  // Pad with 20px on each side so context is visible, minimum 300px wide for badge.
  const PADDING = 20;
  const rawMeta = await sharp(buf).metadata();
  const minWidth = 300;
  const extraW = Math.max(0, minWidth - (rawMeta.width + PADDING * 2));
  const paddedBuf = await sharp(buf)
    .extend({
      top: PADDING,
      bottom: PADDING,
      left: PADDING + Math.floor(extraW / 2),
      right: PADDING + Math.ceil(extraW / 2),
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .toBuffer();

  // Overlay green badge top-right — mirrors NavA11y's red badge position/style.
  const paddedMeta = await sharp(paddedBuf).metadata();
  const label = `SC ${sc}: RESOLVED ✓`;
  const badgeW = Math.min(220, paddedMeta.width - 8);
  const badgeH = 26;
  const badgeX = paddedMeta.width - badgeW - 4;
  const badge = Buffer.from(
    `<svg width="${badgeW}" height="${badgeH}">` +
      `<rect width="${badgeW}" height="${badgeH}" fill="#1a7f37" rx="3"/>` +
      `<text x="8" y="18" font-family="sans-serif" font-size="12" fill="white">${label}</text>` +
      `</svg>`,
  );

  await sharp(paddedBuf)
    .composite([{ input: badge, top: 4, left: badgeX }])
    .png()
    .toFile(outputPath);
}

/**
 * Crop a full-page screenshot to the element's bounding box with padding.
 * Used to turn NavA11y's full-page before-screenshots into element-level crops.
 */
export async function cropToBbox({ inputPath, bbox, outputPath, padding = 20 }) {
  const sharp = (await import("sharp")).default;
  const { x, y, width, height } = normalizeBbox(bbox);
  const meta = await sharp(inputPath).metadata();

  const left = Math.max(0, Math.round(x - padding));
  const top = Math.max(0, Math.round(y - padding));
  const right = Math.min(meta.width, Math.round(x + width + padding));
  const bottom = Math.min(meta.height, Math.round(y + height + padding));

  await sharp(inputPath)
    .extract({ left, top, width: right - left, height: bottom - top })
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
