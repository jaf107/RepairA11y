#!/usr/bin/env node
/**
 * Visual showcase: detect → generate → before/after focus screenshot.
 *
 * Skips the closed-loop serialize-and-re-verify step (which is unreliable on
 * heavy live DOMs) and instead just SHOWS the patched :focus-visible state on
 * the real page. Use this to eyeball whether a generated patch actually makes
 * the focus indicator visible.
 *
 * Usage:
 *   node --env-file=.env src/showcase/run_showcase.js --file datasets/dnew/cases/dnew-09-dark-theme-focus-invisible.html
 *   node --env-file=.env src/showcase/run_showcase.js --url https://www.nih.gov
 *   node              src/showcase/run_showcase.js --file <path> --dry   # no API call (no patch)
 *
 * Flags:
 *   --file <path>   local HTML fixture
 *   --url  <url>    live URL (uses real-desktop UA to avoid bot-challenge pages)
 *   --level E1..E4  evidence level for the LLM (default E3)
 *   --out <dir>     output dir for before/after PNGs (default docs/showcase_output)
 *   --dry           skip LLM; just screenshot the unpatched focus state
 *
 * Requires OPENROUTER_API_KEY (unless --dry).
 */
import { mkdir } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

import { runDetection } from "../detector/index.js";
import { packageEvidence } from "../evidence/packager.js";
import { createLlmGenerator } from "../generators/llm_based/index.js";
import { applyPatch } from "../patches/applier.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..", "..");

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function parseArgs() {
  const argv = process.argv.slice(2);
  const get = (f) => {
    const i = argv.indexOf(f);
    return i !== -1 ? argv[i + 1] : null;
  };
  return {
    file: get("--file"),
    url: get("--url"),
    level: get("--level") ?? "E3",
    out: get("--out") ?? join(repoRoot, "docs/showcase_output"),
    dry: argv.includes("--dry"),
    // Optional: target a specific failing element instead of the first
    // 2.4.13 FAIL (some sites' first violation is visually subtle).
    selector: get("--selector"),
  };
}

async function main() {
  const opts = parseArgs();
  if (!opts.file && !opts.url) {
    console.error("Provide --file <path> or --url <url>");
    process.exit(1);
  }

  const target = opts.url ? { url: opts.url } : { htmlFile: resolve(opts.file) };
  const label = opts.url ?? opts.file;

  console.log(`Detecting violations on ${label} ...`);
  const detection = await runDetection(target);
  const violation = detection.violations.find(
    (v) =>
      v.sc === "2.4.13" &&
      v.result === "FAIL" &&
      (!opts.selector || v.element?.selector === opts.selector),
  );
  if (!violation) {
    console.error(
      opts.selector
        ? `No SC 2.4.13 FAIL found for selector: ${opts.selector}`
        : "No SC 2.4.13 FAIL found.",
    );
    process.exit(1);
  }
  const selector = violation.element?.selector;
  console.log(`Target: ${selector}`);
  console.log(`Reason: ${violation.reason}`);

  let patch = null;
  if (opts.dry) {
    console.log("--dry: skipping LLM, screenshotting unpatched state only.");
  } else {
    const evidence = await packageEvidence({
      violation,
      level: opts.level,
      htmlPath: opts.file ? resolve(opts.file) : null,
      screenshotPath: violation.screenshot ?? null,
    });
    console.log(`Generating patch (LLM, level ${opts.level}) ...`);
    const generator = createLlmGenerator({ evidenceLevel: opts.level });
    patch = await generator.generate({ violation, evidence });
    if (!patch) {
      console.error("Generator returned no patch.");
      process.exit(1);
    }
    console.log("Patch:", JSON.stringify(patch, null, 2));
  }

  await mkdir(opts.out, { recursive: true });
  const beforePath = join(opts.out, "before.png");
  const afterPath = join(opts.out, "after.png");

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent: UA,
    });
    const page = await context.newPage();
    const dest = opts.url ?? `file://${resolve(opts.file)}`;
    await page.goto(dest, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForLoadState("load").catch(() => {});
    await page.waitForTimeout(opts.url ? 2000 : 300);

    const locator = page.locator(selector).first();
    if ((await locator.count()) === 0) {
      console.error(`Element not on page (JS-rendered or blocked): ${selector}`);
      process.exit(1);
    }

    // Padded clip around the element so the focus outline is visible against
    // surrounding whitespace (a tight crop or red-border overlay would hide the
    // very indicator we are trying to show).
    const PAD = 24;
    await locator.scrollIntoViewIfNeeded();
    await locator.focus();
    await page.waitForTimeout(200);
    const box = await locator.boundingBox();
    const clip = {
      x: Math.max(0, box.x - PAD),
      y: Math.max(0, box.y - PAD),
      width: box.width + PAD * 2,
      height: box.height + PAD * 2,
    };
    await page.screenshot({ path: beforePath, clip });

    if (patch) await applyPatch(page, patch);
    await locator.focus();
    await page.waitForTimeout(200);
    await page.screenshot({ path: afterPath, clip });

    await context.close();
  } finally {
    await browser.close();
  }

  console.log(`\nBefore: ${beforePath}`);
  console.log(`After:  ${afterPath}`);
  console.log(`\nView:  open "${beforePath}" "${afterPath}"`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
