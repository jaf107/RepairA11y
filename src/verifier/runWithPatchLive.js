import { chromium } from "playwright";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { applyPatch } from "../patches/applier.js";
import { runDetection } from "../detector/index.js";

/**
 * Live-URL equivalent of detectWithPatch (runWithPatch.js).
 *
 * Why inline external CSS before serialization: NavA11y re-runs as a subprocess
 * on the temp file and cannot fetch CDN stylesheets from inside that subprocess
 * (no network context, wrong base URL). Inlining them first makes the serialized
 * file self-contained so computed styles match the live page.
 *
 * @param {object} opts
 * @param {string} opts.url    Live URL to repair
 * @param {object} opts.patch  Typed patch to apply before serialization
 * @returns {Promise<{ baselineDetection, patchedDetection, baselineScreenshotPath, screenshotPath }>}
 */
export async function detectWithPatchLive({ url, patch }) {
  const baselineDetection = await runDetection({ url });

  const tmp = await mkdtemp(join(tmpdir(), "repaira11y-live-"));
  const baselineScreenshotPath = join(tmp, "baseline.png");
  const screenshotPath = join(tmp, "patched.png");
  const tempFile = join(tmp, "patched.html");

  const browser = await chromium.launch();
  try {
    // Match NavA11y's real-desktop UA. The default headless UA contains
    // "HeadlessChrome", which Cloudflare and similar WAFs serve a bot-challenge
    // page to — that challenge page has no real content, producing false
    // RESOLVED verdicts. NavA11y already uses this exact UA for detection, so
    // matching it keeps the patch/verify pass on the same page the baseline saw.
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });
    const page = await context.newPage();
    // "networkidle" never fires on production sites (ads/analytics/polling keep
    // the network busy). Wait for DOM + a fixed settle window instead.
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForLoadState("load").catch(() => {});
    await page.waitForTimeout(2000);

    await page.screenshot({ path: baselineScreenshotPath, fullPage: true });

    await page.evaluate(async () => {
      const links = [...document.querySelectorAll('link[rel="stylesheet"]')];
      await Promise.all(
        links.map(async (link) => {
          try {
            const res = await fetch(link.href);
            if (!res.ok) return;
            const text = await res.text();
            const style = document.createElement("style");
            style.textContent = text;
            link.parentNode.replaceChild(style, link);
          } catch {
            // Leave <link> in place if fetch fails (CORS, network error, etc.)
          }
        }),
      );
    });

    await applyPatch(page, patch);

    await page.screenshot({ path: screenshotPath, fullPage: true });

    const serialized = await page.evaluate(
      () => `<!doctype html>${document.documentElement.outerHTML}`,
    );
    await writeFile(tempFile, serialized);

    await context.close();
  } finally {
    await browser.close();
  }

  const patchedDetection = await runDetection({ htmlFile: tempFile });

  return { baselineDetection, patchedDetection, baselineScreenshotPath, screenshotPath };
}
