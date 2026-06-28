/**
 * Render before/after focus screenshots for D_d cases using the ACTUAL LLM patches
 * recorded in the RQ1 (evidence ablation) run. No API call is made: the patches are
 * read from the saved result JSON and applied with the real patch applier, so the
 * "after" image shows exactly what the recorded LLM patch produces.
 *
 *   node report/results-chapter/figures/make_dd_examples.mjs
 */
import { chromium } from "playwright";
import { readFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { applyPatch } from "../../../src/patches/applier.js";

const FIGDIR = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(FIGDIR, "..", "..", "..");

// caseId -> { fixture (relative to repo), selector, patch, label, out }
const RQ2 = resolve(
  REPO,
  "experiments/rq2_evidence_ablation/results/run-2026-06-21T06-19-00-943Z.json",
);

const LABELS = {
  "focus-appearance-outline-insufficient-contrast.html": ["dd1", "Insufficient outline contrast"],
  "focus-appearance-outline-insufficient-width.html": ["dd2", "Insufficient outline width"],
  "focus-appearance-border-insufficient-width.html": ["dd3", "Insufficient border width"],
  "focus-appearance-background-insufficient-contrast.html": ["dd4", "Low background contrast"],
  "colour-and-contrast-focus-not-visible.html": ["dd5", "No focus indicator"],
  "keyboard-access-keyboard-focus-is-not-indicated-visually.html": ["dd6", "Focus not indicated"],
};

async function main() {
  const data = JSON.parse(await readFile(RQ2, "utf8"));
  // pick one RESOLVED E3 trial (with a patch) per fixture
  const chosen = new Map();
  for (const r of data.allResults) {
    if (r.evidenceLevel !== "E3" || r.status !== "RESOLVED" || !r.patch) continue;
    const base = r.fixturePath.split("/").pop();
    if (!LABELS[base] || chosen.has(base)) continue;
    chosen.set(base, r);
  }

  await mkdir(FIGDIR, { recursive: true });
  const browser = await chromium.launch();
  const manifest = [];
  try {
    for (const [base, r] of chosen) {
      const [tag, label] = LABELS[base];
      const selector = r.patch.target_selector;
      const ctx = await browser.newContext({ viewport: { width: 640, height: 320 } });
      const page = await ctx.newPage();
      await page.goto(`file://${r.fixturePath}`, { waitUntil: "load" });
      const loc = page.locator(selector).first();
      await loc.scrollIntoViewIfNeeded();
      await loc.focus();
      await page.waitForTimeout(120);
      const box = await loc.boundingBox();
      // Tight crop: just the element plus a small margin so the focus outline and
      // its offset are visible, but no neighbouring text is caught and clipped.
      const PAD = 10;
      const clip = {
        x: Math.max(0, box.x - PAD),
        y: Math.max(0, box.y - PAD),
        width: box.width + PAD * 2,
        height: box.height + PAD * 2,
      };
      await page.screenshot({ path: `${FIGDIR}/${tag}_before.png`, clip });
      await applyPatch(page, r.patch);
      await loc.focus();
      await page.waitForTimeout(120);
      await page.screenshot({ path: `${FIGDIR}/${tag}_after.png`, clip });
      await ctx.close();
      const rule = r.patch.payload?.rule ?? JSON.stringify(r.patch.payload);
      manifest.push({ tag, label, base, selector, rule, technique: r.patch.wcag_technique_cited });
      console.log(`${tag}: ${label} -> ${tag}_before.png / ${tag}_after.png`);
    }
  } finally {
    await browser.close();
  }
  console.log("\nMANIFEST:");
  for (const m of manifest) console.log(`  ${m.tag}  ${m.label}  [${m.technique}]  ${m.rule}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
