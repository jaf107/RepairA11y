#!/usr/bin/env node
/**
 * manual-review — package a repair-url run into an inspection bundle
 * with TWO HTML variants per page (stripped + live) so the reviewer
 * gets BOTH verification accuracy AND visual fidelity.
 *
 *   <out>/
 *     baseline.html             — STRIPPED (no scripts) — used by verifier
 *     baseline-live.html        — LIVE (scripts kept) — use this for visual review
 *     baseline.png              — full-page screenshot (live render)
 *     baseline-focused.png      — screenshot with the FIRST target element focused
 *     patched.html              — all patches applied to stripped baseline
 *     patched-live.html         — all patches applied to live baseline (open in browser!)
 *     patched.png               — full-page screenshot
 *     case-N/
 *       patched.html            — just patch N applied (stripped)
 *       patched-live.html       — just patch N applied (LIVE — open in browser)
 *       patched.png             — full-page screenshot
 *       patched-focused.png     — screenshot with the target element focused
 *       patch.json              — the typed patch
 *     patches.json
 *     REVIEW.md
 *
 * The LIVE files preserve the original site's styling, fonts, and
 * dynamic content — they look the way real users see the site. The
 * STRIPPED files are byte-for-byte what the verifier evaluated.
 *
 * Usage:
 *   npm run review -- <url-or-file> [options]
 *
 * Options:
 *   --out <dir>                 output directory (default: ./review-output/<timestamp>)
 *   --generator <rule|llm>      default: rule
 *   --level <E1|E2|E3|E4>       evidence level for LLM (default: E3)
 *   --sc <2.4.7|2.4.11|...>     filter to one SC
 *   --max <N>                   cap number of cases (default: all FAILs)
 *   --iter <N>                  max iterations per case (default: 3)
 *   --no-focused-shots          skip the focused-state screenshots (faster)
 */
import { mkdir, writeFile, copyFile, readFile } from "node:fs/promises";
import { resolve, isAbsolute, join } from "node:path";
import { existsSync } from "node:fs";
import { chromium } from "playwright";
import { runDetection } from "../src/detector/index.js";
import { repairLoop } from "../src/loop/repair_loop.js";
import { packageEvidence } from "../src/evidence/packager.js";
import { ruleBasedGenerator } from "../src/generators/rule_based/index.js";
import { createLlmGenerator } from "../src/generators/llm_based/index.js";
import { applyPatch } from "../src/patches/applier.js";
import { fetchPageToFile } from "../src/utils/fetchPage.js";

const VALID_SCS = ["2.4.7", "2.4.11", "2.4.12", "2.4.13"];

function parseArgs(argv) {
  const a = argv.slice(2);
  if (!a.length || a[0] === "--help" || a[0] === "-h") {
    console.log(`
Usage: npm run review -- <url-or-file> [options]

Options:
  --out <dir>                 output directory (default: ./review-output/<timestamp>)
  --generator <rule|llm>      default: rule
  --level <E1|E2|E3|E4>       evidence level for LLM (default: E3)
  --sc <2.4.7|2.4.11|...>     filter to one SC
  --max <N>                   cap number of cases (default: all FAILs)
  --iter <N>                  max iterations per case (default: 3)
  --no-focused-shots          skip focused-state screenshots (faster)
`);
    process.exit(0);
  }
  const opts = {
    target: a[0],
    out: null,
    generator: "rule",
    level: "E3",
    sc: null,
    max: Infinity,
    iter: 3,
    focusedShots: true,
  };
  for (let i = 1; i < a.length; i++) {
    switch (a[i]) {
      case "--out": opts.out = a[++i]; break;
      case "--generator": opts.generator = a[++i]; break;
      case "--level": opts.level = a[++i]; break;
      case "--sc": opts.sc = a[++i]; break;
      case "--max": opts.max = parseInt(a[++i], 10); break;
      case "--iter": opts.iter = parseInt(a[++i], 10); break;
      case "--no-focused-shots": opts.focusedShots = false; break;
      default: console.error(`unknown arg: ${a[i]}`); process.exit(1);
    }
  }
  if (!opts.out) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    opts.out = resolve("review-output", stamp);
  } else {
    opts.out = isAbsolute(opts.out) ? opts.out : resolve(opts.out);
  }
  return opts;
}

const isUrl = (s) => /^https?:\/\//i.test(s);

/**
 * Render a URL into TWO files:
 *  - stripped: NavA11y-compatible (scripts/iframes removed)
 *  - live:     visual-fidelity copy (everything preserved)
 *
 * For local files we copy as-is to both paths (no script stripping
 * needed for D_d test fixtures).
 */
async function resolveTarget(target, outDir) {
  if (isUrl(target)) {
    console.log(`[fetch] rendering ${target} (stripped for verifier)…`);
    const stripped = await fetchPageToFile(target, { stripExternal: true });
    console.log(`[fetch] rendering ${target} (live for visual review)…`);
    const live = await fetchPageToFile(target, { stripExternal: false });
    return {
      strippedFile: stripped.file,
      liveFile: live.file,
      label: target,
      finalUrl: stripped.finalUrl,
    };
  }
  const abs = isAbsolute(target) ? target : resolve(process.cwd(), target);
  if (!existsSync(abs)) throw new Error(`local file not found: ${abs}`);
  return {
    strippedFile: abs,
    liveFile: abs, // local fixtures don't need stripping
    label: abs,
    finalUrl: `file://${abs}`,
  };
}

function buildGenerator(opts) {
  if (opts.generator === "rule") return ruleBasedGenerator;
  return createLlmGenerator({ evidenceLevel: opts.level });
}

async function withBrowser(fn) {
  const browser = await chromium.launch();
  try {
    return await fn(browser);
  } finally {
    await browser.close();
  }
}

async function applyPatchesToHtml(srcHtml, patches) {
  return withBrowser(async (browser) => {
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    const page = await ctx.newPage();
    // setContent + waitUntil: domcontentloaded preserves embedded scripts &
    // stylesheets in the saved HTML without needing them to fully execute.
    await page.setContent(srcHtml, { waitUntil: "domcontentloaded" });
    for (const p of patches) {
      try {
        await applyPatch(page, p);
      } catch (e) {
        console.warn(
          `  [warn] could not apply patch ${p.target_selector}: ${e.message}`,
        );
      }
    }
    const html = await page.evaluate(
      () => "<!doctype html>\n" + document.documentElement.outerHTML,
    );
    await ctx.close();
    return html;
  });
}

async function screenshotHtml(htmlFile, pngPath) {
  await withBrowser(async (browser) => {
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    const page = await ctx.newPage();
    await page.goto(`file://${htmlFile}`, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });
    // Don't wait for networkidle/fonts: file:// can't reach CDNs and
    // these waits will hang for the full timeout.
    await page.waitForTimeout(500);
    await page.screenshot({
      path: pngPath,
      fullPage: true,
      timeout: 15000,
      animations: "disabled",
    });
    await ctx.close();
  });
}

/**
 * Take a screenshot with the specified element focused. Crops tightly
 * around the element (with padding) so the focus indicator is the
 * visual subject of the image — much more useful than a viewport shot
 * where the element might be a small region.
 *
 * Returns true on success, false if element couldn't be focused.
 */
async function screenshotFocused(htmlFile, selector, pngPath) {
  try {
    return await withBrowser(async (browser) => {
      const ctx = await browser.newContext({
        viewport: { width: 1280, height: 800 },
      });
      const page = await ctx.newPage();
      await page.goto(`file://${htmlFile}`, {
        waitUntil: "domcontentloaded",
        timeout: 15000,
      });
      // Don't wait for fonts/network: file:// can't fetch CDN assets.
      await page.waitForTimeout(500);
      const found = await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return false;
        if (typeof el.scrollIntoView === "function") {
          el.scrollIntoView({ block: "center", behavior: "instant" });
        }
        if (typeof el.focus === "function") el.focus();
        return document.activeElement === el;
      }, selector);
      if (!found) {
        await ctx.close();
        return false;
      }
      // Small delay so focus styles can transition.
      await page.waitForTimeout(200);

      // Try to crop tightly around the focused element so the focus
      // indicator is visually prominent. Fall back to viewport shot
      // if bbox info is unavailable.
      const bbox = await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      }, selector);

      if (
        bbox &&
        bbox.width > 0 &&
        bbox.height > 0 &&
        bbox.x >= -200 &&
        bbox.y >= -200
      ) {
        const pad = 60;
        const clip = {
          x: Math.max(0, bbox.x - pad),
          y: Math.max(0, bbox.y - pad),
          width: Math.min(1280, bbox.width + pad * 2),
          height: Math.min(800, bbox.height + pad * 2),
        };
        await page.screenshot({ path: pngPath, clip });
      } else {
        await page.screenshot({ path: pngPath, fullPage: false });
      }
      await ctx.close();
      return true;
    });
  } catch (e) {
    console.warn(`  [warn] focused screenshot failed: ${e.message}`);
    return false;
  }
}

async function main() {
  const opts = parseArgs(process.argv);
  await mkdir(opts.out, { recursive: true });
  console.log(`[review] output dir: ${opts.out}`);

  const { strippedFile, liveFile, label, finalUrl } = await resolveTarget(
    opts.target,
    opts.out,
  );

  // Persist baseline (both flavors).
  const baselineStrippedPath = join(opts.out, "baseline.html");
  const baselineLivePath = join(opts.out, "baseline-live.html");
  await copyFile(strippedFile, baselineStrippedPath);
  await copyFile(liveFile, baselineLivePath);
  console.log(`[review] saved baseline.html (stripped) + baseline-live.html`);

  await screenshotHtml(baselineLivePath, join(opts.out, "baseline.png"));
  console.log(`[review] saved baseline.png (full page)`);

  // Detect against the STRIPPED file — that's what the verifier will use.
  const detection = await runDetection({ htmlFile: baselineStrippedPath });
  const fails = detection.violations.filter(
    (v) =>
      v.result === "FAIL" &&
      (!opts.sc || v.sc === opts.sc) &&
      VALID_SCS.includes(v.sc),
  );
  const cases = fails.slice(0, opts.max);
  console.log(`[review] ${cases.length} target FAILs to repair`);

  // First-target focused baseline shot for context.
  if (opts.focusedShots && cases[0]?.element?.selector) {
    const ok = await screenshotFocused(
      baselineLivePath,
      cases[0].element.selector,
      join(opts.out, "baseline-focused.png"),
    );
    if (ok) console.log(`[review] saved baseline-focused.png`);
  }

  const generator = buildGenerator(opts);
  const records = [];

  for (const [i, violation] of cases.entries()) {
    const n = i + 1;
    console.log(
      `\n[case ${n}/${cases.length}] sc=${violation.sc} selector=${violation.element?.selector}`,
    );
    const evidence = await packageEvidence({
      violation,
      level: opts.level,
      htmlPath: baselineStrippedPath,
      screenshotPath: violation.screenshot ?? null,
    });
    const loop = await repairLoop({
      violation,
      htmlFile: baselineStrippedPath,
      generator,
      evidence,
      maxIterations: opts.iter,
    });
    const verify = loop.history.at(-1)?.verify ?? null;
    console.log(
      `  → ${loop.status}  ssim=${verify?.similarity?.toFixed?.(3) ?? "n/a"}`,
    );
    records.push({ n, violation, loop, verify });

    if (loop.acceptedPatch) {
      const caseDir = join(opts.out, `case-${n}`);
      await mkdir(caseDir, { recursive: true });

      // Apply patch to BOTH the stripped baseline and the live baseline.
      const strippedSrc = await readFile(baselineStrippedPath, "utf8");
      const liveSrc = await readFile(baselineLivePath, "utf8");
      const patchedStripped = await applyPatchesToHtml(strippedSrc, [
        loop.acceptedPatch,
      ]);
      const patchedLive = await applyPatchesToHtml(liveSrc, [
        loop.acceptedPatch,
      ]);

      const patchedStrippedPath = join(caseDir, "patched.html");
      const patchedLivePath = join(caseDir, "patched-live.html");
      await writeFile(patchedStrippedPath, patchedStripped);
      await writeFile(patchedLivePath, patchedLive);

      await screenshotHtml(patchedLivePath, join(caseDir, "patched.png"));
      if (opts.focusedShots && violation.element?.selector) {
        const ok = await screenshotFocused(
          patchedLivePath,
          violation.element.selector,
          join(caseDir, "patched-focused.png"),
        );
        if (ok) console.log(`  saved patched-focused.png`);
      }

      await writeFile(
        join(caseDir, "patch.json"),
        JSON.stringify(loop.acceptedPatch, null, 2),
      );
    }
  }

  // Combined: all accepted patches applied together.
  const accepted = records.map((r) => r.loop.acceptedPatch).filter(Boolean);
  if (accepted.length) {
    const strippedSrc = await readFile(baselineStrippedPath, "utf8");
    const liveSrc = await readFile(baselineLivePath, "utf8");
    await writeFile(
      join(opts.out, "patched.html"),
      await applyPatchesToHtml(strippedSrc, accepted),
    );
    await writeFile(
      join(opts.out, "patched-live.html"),
      await applyPatchesToHtml(liveSrc, accepted),
    );
    await screenshotHtml(
      join(opts.out, "patched-live.html"),
      join(opts.out, "patched.png"),
    );
    console.log(
      `[review] saved patched.html + patched-live.html (${accepted.length} patches combined)`,
    );
  }

  await writeFile(
    join(opts.out, "patches.json"),
    JSON.stringify(
      records.map((r) => ({
        n: r.n,
        sc: r.violation.sc,
        selector: r.violation.element?.selector ?? null,
        reason: r.violation.reason,
        status: r.loop.status,
        iterations: r.loop.iterations,
        patch: r.loop.acceptedPatch,
        verify: r.verify
          ? {
              status: r.verify.status,
              targetResolved: r.verify.targetResolved,
              newFailureCount: r.verify.newFailureCount,
              similarity: r.verify.similarity,
            }
          : null,
      })),
      null,
      2,
    ),
  );

  await writeFile(
    join(opts.out, "REVIEW.md"),
    renderReview({ opts, label, finalUrl, records }),
  );
  console.log(
    `\n[review] DONE — open ${join(opts.out, "REVIEW.md")} to start your inspection`,
  );
}

function devtoolsSnippet(patches) {
  // Reduce all accepted patches to a single style block the reviewer can
  // paste into DevTools Console on the LIVE site for a true visual check.
  const rules = patches
    .filter((p) => p?.patch_type === "css_inject")
    .map((p) => p.payload.rule)
    .join("\n  ");
  if (!rules) return null;
  return `// Paste into DevTools Console on the live page:
const s = document.createElement('style');
s.id = 'repaira11y-preview';
s.textContent = \`
  ${rules}
\`;
document.head.appendChild(s);
// To remove: document.getElementById('repaira11y-preview')?.remove();`;
}

function renderReview({ opts, label, finalUrl, records }) {
  const accepted = records.map((r) => r.loop.acceptedPatch).filter(Boolean);
  const snippet = devtoolsSnippet(accepted);

  const lines = [];
  lines.push(`# Manual Review — ${label}`);
  lines.push("");
  lines.push(`- Generated: ${new Date().toISOString()}`);
  lines.push(
    `- Generator: \`${opts.generator}\`${opts.generator === "llm" ? ` (evidence level ${opts.level})` : ""}`,
  );
  lines.push(`- Final URL: ${finalUrl}`);
  lines.push(`- Total cases: **${records.length}**`);
  lines.push(
    `- Resolved by NavA11y: **${records.filter((r) => r.loop.status === "RESOLVED").length}** / ${records.length}`,
  );
  lines.push("");

  lines.push("## How to do the review");
  lines.push("");
  lines.push("**Read this part carefully — there's a real limitation to be aware of.**");
  lines.push("");
  lines.push("Modern websites (Qualtrics, Stripe, anything React/Next/etc.) cannot be saved to a local HTML file in a way that looks the way real users see them. The site's JavaScript bundles and fonts live on CDNs that browsers refuse to load from `file://`, its API calls fail because the origin doesn't match, and so on. **No tool can fully reproduce a dynamic site offline.**");
  lines.push("");
  lines.push("So the right way to do the visual review is **on the live production site**, not on a saved HTML file. The saved files are useful for record-keeping (what was the page when you ran this?) but not for judging visual quality.");
  lines.push("");
  lines.push("Three review workflows, in order of how reliable they are:");
  lines.push("");
  lines.push("### ✅ Option A — Inject the patches into the live site (gold standard)");
  lines.push("");
  lines.push(`1. Open the production URL in your browser: **${finalUrl}**`);
  lines.push("2. Open DevTools (⌘+Option+I on Mac, F12 on Windows/Linux) → Console tab");
  lines.push("3. Paste this snippet and press Enter — it injects all the accepted patches:");
  lines.push("");
  if (snippet) {
    lines.push("```javascript");
    lines.push(snippet);
    lines.push("```");
  } else {
    lines.push("_(No `css_inject` patches in this run — DevTools preview not generated.)_");
  }
  lines.push("");
  lines.push("4. Press **Tab** repeatedly until you reach each target element (selectors listed below).");
  lines.push("5. Look at the focus outline. Compare it to what it looked like before (you can toggle by running `document.getElementById('repaira11y-preview')?.remove()` in the Console to remove the patches and `document.head.appendChild(s)` to re-add them — or just refresh the page).");
  lines.push("6. Decide accept / revise / reject in the per-case sections below.");
  lines.push("");
  lines.push("This is the most reliable workflow because the page is fully rendered, fully interactive, and exactly what a real user would see.");
  lines.push("");
  lines.push("### 🟡 Option B — Compare the focused-state PNGs (quick sanity check)");
  lines.push("");
  lines.push("`baseline-focused.png` shows the page with the first target element focused, captured by Playwright with full rendering. Each case folder has a `patched-focused.png` showing the same element after the patch is applied. Open both in an image viewer and compare. Useful for a fast visual diff without leaving your editor.");
  lines.push("");
  lines.push("These PNGs were captured by Playwright against the actual rendered DOM, so they're faithful to what the focus state looks like — even when the saved HTML wouldn't render correctly.");
  lines.push("");
  lines.push("### ⚠️ Option C — Open the saved HTML files (limited usefulness)");
  lines.push("");
  lines.push("`baseline-live.html` and `case-N/patched-live.html` are post-hydration snapshots — they keep the original page's scripts, stylesheets, and content. For **simple/static pages** (like our D_d test fixtures) they render correctly and you can Tab through them like a real page. For **complex dynamic sites** (Qualtrics, etc.) most of the visual fidelity won't survive being saved to disk. Use these for inspecting D_d fixtures; use Option A for production sites.");
  lines.push("");
  lines.push("The `baseline.html` and `patched.html` files (without `-live`) are the *stripped* versions the verifier evaluated — scripts removed so NavA11y can re-load them. **Don't open these for visual review** — they're for the record only.");
  lines.push("");

  lines.push("## File inventory");
  lines.push("");
  lines.push("| File | Use it for |");
  lines.push("|---|---|");
  lines.push("| `baseline-live.html` | Visual review of original page (scripts intact) |");
  lines.push("| `baseline.html` | What the verifier evaluated (stripped, don't use for visual review) |");
  lines.push("| `baseline.png` | Full-page screenshot of original |");
  if (opts.focusedShots) {
    lines.push("| `baseline-focused.png` | Screenshot with first target element focused |");
  }
  lines.push("| `patched-live.html` | Visual review of ALL patches combined |");
  lines.push("| `patched.html` | Verifier's view of ALL patches combined |");
  lines.push("| `patched.png` | Full-page screenshot of patched page |");
  lines.push("| `case-N/patched-live.html` | Visual review of just patch N (open this in browser) |");
  lines.push("| `case-N/patched.html` | Verifier's view of just patch N |");
  lines.push("| `case-N/patched.png` | Screenshot of just patch N |");
  if (opts.focusedShots) {
    lines.push("| `case-N/patched-focused.png` | Screenshot with target focused — quickest visual check |");
  }
  lines.push("| `case-N/patch.json` | The typed patch object |");
  lines.push("| `patches.json` | Machine-readable record of every case + verdict |");
  lines.push("");
  lines.push("---");
  lines.push("");

  for (const r of records) {
    lines.push(`## Case ${r.n} — SC ${r.violation.sc}`);
    lines.push("");
    lines.push(`- **Element:** \`${r.violation.element?.selector ?? "(page-level)"}\``);
    if (r.violation.reason) {
      lines.push(`- **Why NavA11y flagged it:** ${r.violation.reason}`);
    }
    lines.push(`- **NavA11y verdict after patch:** ${r.loop.status}`);
    if (r.verify) {
      lines.push(
        `- **Verifier:** target resolved = ${r.verify.targetResolved}, new failures introduced = ${r.verify.newFailureCount ?? 0}, visual similarity = ${r.verify.similarity?.toFixed?.(3) ?? "n/a"}`,
      );
    }
    lines.push("");
    if (r.loop.acceptedPatch) {
      lines.push("**Proposed patch:**");
      lines.push("```json");
      lines.push(JSON.stringify(r.loop.acceptedPatch, null, 2));
      lines.push("```");
      lines.push("");
      lines.push(`**Rationale:** ${r.loop.acceptedPatch.rationale}`);
      lines.push("");
      lines.push("**Inspect this case:**");
      lines.push("");
      if (r.loop.acceptedPatch.patch_type === "css_inject") {
        const oneRule = r.loop.acceptedPatch.payload.rule;
        const sel = r.violation.element?.selector ?? "";
        lines.push("**🔬 Recommended — try it on the live site.** Paste in DevTools Console:");
        lines.push("");
        lines.push("```javascript");
        lines.push(`const s = document.createElement('style');`);
        lines.push(`s.id = 'repaira11y-case-${r.n}';`);
        lines.push(`s.textContent = ${JSON.stringify(oneRule)};`);
        lines.push(`document.head.appendChild(s);`);
        if (sel) {
          lines.push("// Then tab to the element, or programmatically focus it:");
          lines.push(`document.querySelector(${JSON.stringify(sel)})?.focus();`);
        }
        lines.push("// To remove the patch:");
        lines.push(`// document.getElementById('repaira11y-case-${r.n}')?.remove();`);
        lines.push("```");
        lines.push("");
      }
      lines.push(`📷 PNG check: [baseline-focused.png](./baseline-focused.png) vs [case-${r.n}/patched-focused.png](./case-${r.n}/patched-focused.png)`);
      lines.push("");
      lines.push(`📄 Saved HTML (limited fidelity for dynamic sites): [case-${r.n}/patched-live.html](./case-${r.n}/patched-live.html)`);
      lines.push("");
      lines.push(`🧾 Raw patch: [case-${r.n}/patch.json](./case-${r.n}/patch.json)`);
    } else {
      lines.push("_No patch was accepted by the loop._");
    }
    lines.push("");
    lines.push("**Manual checklist:**");
    lines.push("- [ ] Compared focus state in baseline vs patched (any of options A/B/C above)");
    lines.push("- [ ] New focus indicator is clearly visible");
    lines.push("- [ ] New focus indicator has good contrast against its background");
    lines.push("- [ ] Patch does NOT break the visual layout around the element");
    lines.push("- [ ] Patch does NOT cause unrelated regressions on other elements");
    lines.push("- [ ] (LLM only) Rationale matches the actual fix — no hallucinated technique citations");
    lines.push("");
    lines.push("**Verdict:** ☐ accept  ☐ revise (write notes below)  ☐ reject");
    lines.push("");
    lines.push("**Notes:** _(optional — anything surprising, side effects, ideas for a better fix)_");
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  lines.push("## Final summary");
  lines.push("");
  lines.push("Once every case is reviewed, fill in:");
  lines.push("");
  lines.push("- Accepted: ___ / " + records.length);
  lines.push("- Revised: ___ / " + records.length);
  lines.push("- Rejected: ___ / " + records.length);
  lines.push("");
  lines.push("- Reviewer: ___________________________");
  lines.push("- Date completed: ___________________________");
  lines.push("");
  lines.push(
    "Save this file once done — it's the oracle row for this URL in your thesis.",
  );
  return lines.join("\n");
}

main().catch((e) => {
  console.error("[review] FATAL:", e);
  process.exit(1);
});
