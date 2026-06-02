import { chromium } from "playwright";
import { mkdtemp, writeFile, readFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, basename, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..", "..");
const NAVA11Y_DIR = join(repoRoot, "nava11y");

import { applyPatch } from "../patches/applier.js";
import { runDetection } from "../detector/index.js";

/**
 * Materialize a "patched" copy of an HTML fixture by applying a patch in a
 * Playwright page, then serializing the resulting document.documentElement
 * back to disk. The patched file is run through NavA11y to produce a post-patch
 * results.json + screenshot.
 *
 * Why serialize-then-rerun (instead of patching in-memory and asking NavA11y
 * to inspect the live page)? NavA11y is a black-box subprocess that owns its
 * own browser session. Round-tripping through disk lets us reuse it unchanged.
 *
 * @param {object} opts
 * @param {string} opts.htmlFile  Path to the input fixture (D_d-style local HTML)
 * @param {object} opts.patch     Typed patch to apply before serialization
 * @returns {Promise<{ patchedFile: string, patchedDetection: object, baselineDetection: object, screenshotPath: string, baselineScreenshotPath: string }>}
 */
export async function detectWithPatch({ htmlFile, patch }) {
  const baselineDetection = await runDetection({ htmlFile });
  const baselineScreenshotPath = await screenshotHtml(htmlFile);

  const patchedFile = await materializePatchedFile(htmlFile, patch);
  const patchedDetection = await runDetection({ htmlFile: patchedFile });
  const screenshotPath = await screenshotHtml(patchedFile);

  return {
    baselineDetection,
    patchedDetection,
    patchedFile,
    screenshotPath,
    baselineScreenshotPath,
  };
}

async function materializePatchedFile(htmlFile, patch) {
  const html = await readFile(htmlFile, "utf8");
  const tmp = await mkdtemp(join(tmpdir(), "repaira11y-patched-"));
  const outFile = join(tmp, basename(htmlFile));
  await writeFile(outFile, html);

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`file://${outFile}`);
    await applyPatch(page, patch);
    const serialized = await page.evaluate(
      () => `<!doctype html>${document.documentElement.outerHTML}`,
    );
    await writeFile(outFile, serialized);
    await context.close();
  } finally {
    await browser.close();
  }
  return outFile;
}

async function screenshotHtml(htmlFile) {
  const tmp = await mkdtemp(join(tmpdir(), "repaira11y-shot-"));
  const out = join(tmp, "shot.png");
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();
    await page.goto(`file://${htmlFile}`);
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.screenshot({ path: out, fullPage: true });
    await context.close();
  } finally {
    await browser.close();
  }
  return out;
}
