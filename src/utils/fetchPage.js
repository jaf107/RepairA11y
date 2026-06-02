import { chromium } from "playwright";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Render a URL in Playwright, capture the post-hydration DOM, strip scripts
 * and external resources, and write a static snapshot to disk. Lets the rest
 * of the pipeline (verifier, applier) treat URLs and local files uniformly.
 *
 * Why strip scripts/external links from the saved file:
 *   - Without stripping, NavA11y re-loads the snapshot and tries to fetch
 *     every external <script src=> and <link href=> again, which usually
 *     times out (real pages reference dozens of third-party assets).
 *   - We capture the rendered DOM *after* scripts have run, so the hydrated
 *     content is preserved. We just don't want NavA11y to re-execute them.
 *
 * Returns the path to the temp HTML file. Caller is responsible for cleanup
 * if desired (the OS will sweep /tmp eventually).
 */
export async function fetchPageToFile(url, opts = {}) {
  const {
    waitForNetworkIdle = true,
    timeout = 30000,
    stripExternal = true,
  } = opts;
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    const page = await ctx.newPage();
    await page.goto(url, { timeout, waitUntil: "domcontentloaded" });
    if (waitForNetworkIdle) {
      await page
        .waitForLoadState("networkidle", { timeout: 10000 })
        .catch(() => {});
    }
    let html = await page.evaluate(
      () => "<!doctype html>\n" + document.documentElement.outerHTML,
    );
    if (stripExternal) {
      html = stripExternalResources(html);
    }
    const dir = await mkdtemp(join(tmpdir(), "repaira11y-url-"));
    const file = join(dir, "page.html");
    await writeFile(file, html);
    await ctx.close();
    return { file, html, finalUrl: page.url() };
  } finally {
    await browser.close();
  }
}

/**
 * Remove tags/attributes that would cause NavA11y's relaunch to wait on
 * network. Leaves <link rel="stylesheet"> ALONE — accessibility checks need
 * computed styles to be accurate. Use a separate option if a page's CSS
 * also blocks load (rare).
 */
function stripExternalResources(html) {
  return (
    html
      // Remove every <script>…</script> block (inline and external). The DOM
      // we captured is already hydrated; we don't need scripts to re-run.
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
      // Remove <link rel="preload"|"prefetch"|"dns-prefetch"|...> hints
      // that try to fetch JSON / chunks after load.
      .replace(
        /<link\b[^>]*\brel=["'](?:preload|prefetch|dns-prefetch|preconnect|modulepreload)["'][^>]*>/gi,
        "",
      )
      // Remove <iframe src=>… these can hang on third-party loads.
      .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, "")
  );
}
