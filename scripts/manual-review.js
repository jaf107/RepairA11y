#!/usr/bin/env node
/**
 * manual-review — package a repair-url run into an inspection bundle:
 *
 *   <out>/baseline.html       — original page (post-hydration, scripts stripped)
 *   <out>/baseline.png        — full-page screenshot of original
 *   <out>/patched.html        — page with ALL patches applied
 *   <out>/patched.png         — full-page screenshot of patched
 *   <out>/case-N/patched.html — page with just patch N applied (one per case)
 *   <out>/case-N/patched.png  — screenshot of case-N-only patch
 *   <out>/patches.json        — every patch + verifier verdict + metadata
 *   <out>/REVIEW.md           — human-readable checklist
 *
 * Open the HTML files in your browser, press Tab to navigate, and tick
 * off the checkboxes in REVIEW.md. This is the manual-oracle workflow
 * for thesis-grade validation.
 *
 * Usage:
 *   npm run review -- <url-or-file> [options]
 *
 * Options (forward to repair-url): --generator, --level, --sc, --max, --iter
 *   --out <dir>     output directory (default: ./review-output/<timestamp>)
 */
import { mkdir, writeFile, copyFile, readFile } from "node:fs/promises";
import { dirname, resolve, isAbsolute, join } from "node:path";
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
  };
  for (let i = 1; i < a.length; i++) {
    switch (a[i]) {
      case "--out": opts.out = a[++i]; break;
      case "--generator": opts.generator = a[++i]; break;
      case "--level": opts.level = a[++i]; break;
      case "--sc": opts.sc = a[++i]; break;
      case "--max": opts.max = parseInt(a[++i], 10); break;
      case "--iter": opts.iter = parseInt(a[++i], 10); break;
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

function isUrl(s) {
  return /^https?:\/\//i.test(s);
}

async function resolveTarget(target) {
  if (isUrl(target)) {
    console.log(`[fetch] rendering ${target}…`);
    const { file, finalUrl } = await fetchPageToFile(target);
    return { htmlFile: file, label: target, finalUrl };
  }
  const abs = isAbsolute(target) ? target : resolve(process.cwd(), target);
  if (!existsSync(abs)) throw new Error(`local file not found: ${abs}`);
  return { htmlFile: abs, label: abs, finalUrl: `file://${abs}` };
}

function buildGenerator(opts) {
  if (opts.generator === "rule") return ruleBasedGenerator;
  return createLlmGenerator({ evidenceLevel: opts.level });
}

async function snapshot(page, pngPath) {
  await page.screenshot({ path: pngPath, fullPage: true });
}

async function withBrowser(fn) {
  const browser = await chromium.launch();
  try {
    return await fn(browser);
  } finally {
    await browser.close();
  }
}

async function materializeAllPatches(srcHtml, patches) {
  return withBrowser(async (browser) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.setContent(srcHtml);
    for (const p of patches) {
      try { await applyPatch(page, p); } catch (e) {
        console.warn(`  [warn] could not apply patch ${p.target_selector}: ${e.message}`);
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
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(`file://${htmlFile}`, { waitUntil: "domcontentloaded" });
    await snapshot(page, pngPath);
    await ctx.close();
  });
}

async function main() {
  const opts = parseArgs(process.argv);
  await mkdir(opts.out, { recursive: true });
  console.log(`[review] output dir: ${opts.out}`);

  const { htmlFile, label, finalUrl } = await resolveTarget(opts.target);

  // Save baseline
  const baselineHtmlPath = join(opts.out, "baseline.html");
  await copyFile(htmlFile, baselineHtmlPath);
  console.log(`[review] saved baseline.html`);
  await screenshotHtml(htmlFile, join(opts.out, "baseline.png"));
  console.log(`[review] saved baseline.png`);

  // Detect
  const detection = await runDetection({ htmlFile });
  const fails = detection.violations.filter(
    (v) =>
      v.result === "FAIL" &&
      (!opts.sc || v.sc === opts.sc) &&
      VALID_SCS.includes(v.sc),
  );
  const cases = fails.slice(0, opts.max);
  console.log(`[review] ${cases.length} target FAILs to repair`);

  // Repair each
  const generator = buildGenerator(opts);
  const records = [];
  for (const [i, violation] of cases.entries()) {
    const n = i + 1;
    console.log(`\n[case ${n}/${cases.length}] sc=${violation.sc} selector=${violation.element?.selector}`);
    const evidence = await packageEvidence({
      violation,
      level: opts.level,
      htmlPath: htmlFile,
      screenshotPath: violation.screenshot ?? null,
    });
    const loop = await repairLoop({
      violation,
      htmlFile,
      generator,
      evidence,
      maxIterations: opts.iter,
    });
    const verify = loop.history.at(-1)?.verify ?? null;
    console.log(`  → ${loop.status}  ssim=${verify?.similarity?.toFixed?.(3) ?? "n/a"}`);
    records.push({ n, violation, loop, verify });

    if (loop.acceptedPatch) {
      const caseDir = join(opts.out, `case-${n}`);
      await mkdir(caseDir, { recursive: true });
      const srcHtml = await readFile(baselineHtmlPath, "utf8");
      const patchedHtml = await materializeAllPatches(srcHtml, [loop.acceptedPatch]);
      const patchedHtmlPath = join(caseDir, "patched.html");
      await writeFile(patchedHtmlPath, patchedHtml);
      await screenshotHtml(patchedHtmlPath, join(caseDir, "patched.png"));
      await writeFile(
        join(caseDir, "patch.json"),
        JSON.stringify(loop.acceptedPatch, null, 2),
      );
    }
  }

  // Combined patched page (all accepted patches together)
  const accepted = records.map((r) => r.loop.acceptedPatch).filter(Boolean);
  if (accepted.length) {
    const srcHtml = await readFile(baselineHtmlPath, "utf8");
    const allPatched = await materializeAllPatches(srcHtml, accepted);
    await writeFile(join(opts.out, "patched.html"), allPatched);
    await screenshotHtml(join(opts.out, "patched.html"), join(opts.out, "patched.png"));
    console.log(`[review] saved patched.html (all ${accepted.length} patches)`);
  }

  // patches.json
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

  // REVIEW.md
  await writeFile(join(opts.out, "REVIEW.md"), renderReview({ opts, label, finalUrl, records }));
  console.log(`\n[review] DONE — open ${join(opts.out, "REVIEW.md")} to start your inspection`);
}

function renderReview({ opts, label, finalUrl, records }) {
  const lines = [];
  lines.push(`# Manual Review — ${label}`);
  lines.push("");
  lines.push(`- Generated: ${new Date().toISOString()}`);
  lines.push(`- Generator: \`${opts.generator}\` ${opts.generator === "llm" ? `(level ${opts.level})` : ""}`);
  lines.push(`- Final URL: ${finalUrl}`);
  lines.push(`- Total cases: **${records.length}**`);
  lines.push(`- Resolved by NavA11y: **${records.filter((r) => r.loop.status === "RESOLVED").length}**`);
  lines.push("");
  lines.push("## How to do the review");
  lines.push("");
  lines.push("For each case below, open both HTML files in your browser and compare:");
  lines.push("");
  lines.push("1. **Open `baseline.html`** in a browser tab.");
  lines.push("2. **Open `case-N/patched.html`** in another browser tab.");
  lines.push("3. In each tab, press **Tab** to walk through every focusable element.");
  lines.push("4. When you reach the target element listed in the case, compare the focus indicator:");
  lines.push("   - Baseline: what (if anything) appears around the element?");
  lines.push("   - Patched: does the new outline look correct, contrast clearly, not break the layout?");
  lines.push("5. Tick the boxes below. If everything looks right, mark **accept**.");
  lines.push("   If the patch fixed the violation but introduced an ugly side effect, mark **revise**.");
  lines.push("   If the patch didn't actually fix the problem, mark **reject**.");
  lines.push("");
  lines.push("Files in this directory:");
  lines.push("- `baseline.html` / `baseline.png` — the original page");
  lines.push("- `patched.html` / `patched.png` — page with ALL patches applied together");
  lines.push("- `case-N/patched.html` / `case-N/patched.png` — page with just patch N");
  lines.push("- `case-N/patch.json` — the typed patch produced by the generator");
  lines.push("- `patches.json` — machine-readable record of every case + verdict");
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
      lines.push("**Files for this case:**");
      lines.push(`- [Open patched HTML](./case-${r.n}/patched.html)`);
      lines.push(`- [Screenshot](./case-${r.n}/patched.png)`);
      lines.push(`- [Patch JSON](./case-${r.n}/patch.json)`);
    } else {
      lines.push("_No patch was accepted by the loop._");
    }
    lines.push("");
    lines.push("**Manual checklist (tick when you've verified):**");
    lines.push("- [ ] Tabbed to the target element in the baseline file");
    lines.push("- [ ] Tabbed to the target element in the patched file");
    lines.push("- [ ] New focus indicator is clearly visible");
    lines.push("- [ ] New focus indicator has good contrast against its background");
    lines.push("- [ ] Patch does NOT break the visual layout of the element or surrounding content");
    lines.push("- [ ] Patch does NOT cause unrelated regressions on other elements");
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
  lines.push("Save this file once done — it's the oracle row for this URL in your thesis.");
  return lines.join("\n");
}

main().catch((e) => {
  console.error("[review] FATAL:", e);
  process.exit(1);
});
