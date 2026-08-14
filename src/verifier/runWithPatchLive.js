import { chromium } from "playwright";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { applyPatch } from "../patches/applier.js";
import { runDetection } from "../detector/index.js";

/**
 * Live-URL equivalent of detectWithPatch (runWithPatch.js).
 *
 * Both baseline and patched detection run on serialized snapshots from the
 * SAME browser session, so only the patch differs between them.
 *
 * Snapshots are rendered-DOM HTML with an injected <base href>, NOT MHTML:
 * current Chromium renders MHTML archives as inert documents — element.focus()
 * is refused, so every element-level focus check degenerates to "no change".
 * Plain HTML keeps the document interactive; relative subresources resolve
 * over the network through the <base> tag.
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
  const baselineHtml = join(tmp, "baseline.html");
  const patchedHtml = join(tmp, "patched.html");

  async function snapshotHtml(page) {
    return page.evaluate((baseHref) => {
      // Ensure relative URLs keep resolving once the DOM is loaded from disk.
      if (!document.querySelector("base")) {
        const base = document.createElement("base");
        base.href = baseHref;
        document.head.prepend(base);
      }
      return "<!DOCTYPE html>\n" + document.documentElement.outerHTML;
    }, url);
  }

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
    await writeFile(baselineHtml, await snapshotHtml(page));

    await applyPatch(page, patch);

    await page.screenshot({ path: screenshotPath, fullPage: true });
    await writeFile(patchedHtml, await snapshotHtml(page));

    await context.close();
  } finally {
    await browser.close();
  }

  const [baselineDetection, patchedDetection] = await Promise.all([
    runDetection({ htmlFile: baselineHtml }),
    runDetection({ htmlFile: patchedHtml }),
  ]);

  return {
    baselineDetection,
    patchedDetection,
    baselineScreenshotPath,
    screenshotPath,
    baselineHtml,
    patchedHtml,
    tempFile: patchedHtml,
  };
}
