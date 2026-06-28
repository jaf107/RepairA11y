import { chromium } from "playwright";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { applyPatch } from "../patches/applier.js";
import { runDetection } from "../detector/index.js";

/**
 * Live-URL equivalent of detectWithPatch (runWithPatch.js).
 *
 * Both baseline and patched detection run on MHTML snapshots from the same
 * browser session. This eliminates live→static noise: previously baseline used
 * a live URL (NavA11y subprocess, dynamic JS, all CSS loaded) while patched
 * used a serialized HTML file (no JS, CORS CSS missing). Any diff was
 * contaminated by that mismatch. Now both snapshots are taken from the same
 * page load — only the patch differs between them.
 *
 * MHTML via CDP Page.captureSnapshot reads from the browser's internal resource
 * cache, so CORS-restricted CDN CSS/fonts/images are embedded without re-fetching.
 *
 * @param {object} opts
 * @param {string} opts.url    Live URL to repair
 * @param {object} opts.patch  Typed patch to apply
 * @returns {Promise<{ baselineDetection, patchedDetection, baselineScreenshotPath, screenshotPath, tempFile }>}
 */
export async function detectWithPatchLive({ url, patch }) {
  const tmp = await mkdtemp(join(tmpdir(), "repaira11y-live-"));
  const baselineScreenshotPath = join(tmp, "baseline.png");
  const screenshotPath = join(tmp, "patched.png");
  const baselineMhtml = join(tmp, "baseline.mhtml");
  const patchedMhtml = join(tmp, "patched.mhtml");

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForLoadState("load").catch(() => {});
    await page.waitForTimeout(2000);

    await page.screenshot({ path: baselineScreenshotPath, fullPage: true });

    // Capture unpatched MHTML — baseline detection runs on this, not the live URL.
    // Both snapshots come from the same page load so only the patch differs.
    const client = await context.newCDPSession(page);
    const { data: baselineData } = await client.send("Page.captureSnapshot", { format: "mhtml" });
    await writeFile(baselineMhtml, baselineData);

    await applyPatch(page, patch);

    await page.screenshot({ path: screenshotPath, fullPage: true });

    const { data: patchedData } = await client.send("Page.captureSnapshot", { format: "mhtml" });
    await writeFile(patchedMhtml, patchedData);

    await context.close();
  } finally {
    await browser.close();
  }

  const [baselineDetection, patchedDetection] = await Promise.all([
    runDetection({ htmlFile: baselineMhtml }),
    runDetection({ htmlFile: patchedMhtml }),
  ]);

  return {
    baselineDetection,
    patchedDetection,
    baselineScreenshotPath,
    screenshotPath,
    baselineMhtml,
    patchedMhtml,
    tempFile: patchedMhtml,
  };
}
