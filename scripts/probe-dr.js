#!/usr/bin/env node
/**
 * probe-dr — for every site in NavA11y's D_r dataset (the 27 evaluable
 * Semrush top sites), measure how well it survives being saved offline.
 *
 * For each site we record:
 *   - online render time (Playwright fetch + screenshot)
 *   - saved HTML size (stripped vs live)
 *   - offline render time (open the saved file with file:// + screenshot)
 *   - SSIM between online and offline screenshots (1 = identical, 0 = nothing in common)
 *   - number of NavA11y FAILs detected on the stripped snapshot
 *   - whether NavA11y can complete detection at all
 *
 * Sites with high SSIM (≥ 0.85) and ≥ 1 FAIL are "good offline candidates" —
 * you can use Option C of the manual-review (open the saved -live.html file in
 * a browser) and trust what you see.
 *
 * Usage:
 *   node scripts/probe-dr.js               # all sites
 *   node scripts/probe-dr.js --max 5       # cap for a quick smoke
 *   node scripts/probe-dr.js --include qualtrics google   # only matching names
 *
 * Output: scripts/probe-dr-results/<stamp>.{json,md}
 */
import { readFile, mkdir, writeFile, unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve as resolvePath } from "node:path";
import { chromium } from "playwright";
import { fetchPageToFile } from "../src/utils/fetchPage.js";
import { runDetection } from "../src/detector/index.js";
import { compareScreenshots } from "../src/verifier/ssim.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolvePath(__dirname, "..");

function parseArgs(argv) {
  const out = { max: Infinity, include: null };
  const a = argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    if (a[i] === "--max") out.max = parseInt(a[++i], 10);
    else if (a[i] === "--include") {
      out.include = [];
      while (i + 1 < a.length && !a[i + 1].startsWith("--")) {
        out.include.push(a[++i].toLowerCase());
      }
    }
  }
  return out;
}

async function loadDrSites() {
  const ds = JSON.parse(
    await readFile(join(repoRoot, "nava11y/evaluation/dataset.json"), "utf8"),
  );
  return ds.sites;
}

async function screenshotUrl(url) {
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
    const buf = await page.screenshot({
      fullPage: false,
      timeout: 15000,
      animations: "disabled",
    });
    await ctx.close();
    return buf;
  } finally {
    await browser.close();
  }
}

async function screenshotFile(htmlPath) {
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    const page = await ctx.newPage();
    await page.goto(`file://${htmlPath}`, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });
    await page.waitForTimeout(800);
    const buf = await page.screenshot({
      fullPage: false,
      timeout: 15000,
      animations: "disabled",
    });
    await ctx.close();
    return buf;
  } finally {
    await browser.close();
  }
}

async function probeSite(site) {
  const url = site.url;
  const row = {
    url,
    include: site.include,
    excludeReason: site.reason ?? null,
    stage: null,
    error: null,
    onlineMs: null,
    saveMs: null,
    offlineMs: null,
    strippedSize: null,
    liveSize: null,
    ssim: null,
    detectMs: null,
    detectFails: null,
    detectError: null,
    verdict: null,
  };

  if (!site.include) {
    row.verdict = "excluded";
    return row;
  }

  // --- 1) Online render (fetch URL, take screenshot from same Playwright session)
  let onlineShot;
  try {
    row.stage = "online";
    const t0 = Date.now();
    onlineShot = await screenshotUrl(url);
    row.onlineMs = Date.now() - t0;
  } catch (e) {
    row.error = `online render: ${e.message}`;
    row.verdict = "online-fail";
    return row;
  }

  // --- 2) Save both versions
  let stripped, live;
  try {
    row.stage = "save";
    const t0 = Date.now();
    stripped = await fetchPageToFile(url, { stripExternal: true });
    live = await fetchPageToFile(url, { stripExternal: false });
    row.saveMs = Date.now() - t0;
    row.strippedSize = Buffer.byteLength(stripped.html);
    row.liveSize = Buffer.byteLength(live.html);
  } catch (e) {
    row.error = `save: ${e.message}`;
    row.verdict = "save-fail";
    return row;
  }

  // --- 3) Offline render of LIVE snapshot
  let offlineShot;
  try {
    row.stage = "offline";
    const t0 = Date.now();
    offlineShot = await screenshotFile(live.file);
    row.offlineMs = Date.now() - t0;
  } catch (e) {
    row.error = `offline render: ${e.message}`;
    row.verdict = "offline-fail";
    return row;
  }

  // --- 4) SSIM
  try {
    const { similarity } = await compareScreenshots(onlineShot, offlineShot);
    row.ssim = similarity;
  } catch (e) {
    row.ssim = null;
  }

  // --- 5) NavA11y detection on stripped snapshot
  try {
    row.stage = "detect";
    const t0 = Date.now();
    const det = await runDetection({ htmlFile: stripped.file });
    row.detectMs = Date.now() - t0;
    row.detectFails = det.violations.filter(
      (v) =>
        v.result === "FAIL" &&
        ["2.4.7", "2.4.11", "2.4.12", "2.4.13"].includes(v.sc),
    ).length;
  } catch (e) {
    row.detectError = e.message;
  }

  // --- 6) Verdict
  if (row.ssim != null && row.ssim >= 0.85 && row.detectFails > 0) {
    row.verdict = "good";
  } else if (row.ssim != null && row.ssim >= 0.85) {
    row.verdict = "renders-well-no-fails";
  } else if (row.ssim != null && row.ssim >= 0.5) {
    row.verdict = "partial";
  } else {
    row.verdict = "poor";
  }
  return row;
}

function fmtBytes(n) {
  if (n == null) return "—";
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1024 / 1024).toFixed(2)}MB`;
}

function renderMd(results) {
  const lines = [];
  lines.push("# D_r — offline-render probe");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");
  lines.push(
    "Each row records how a D_r site survives being saved to disk and rendered offline. **SSIM** is the visual similarity between the online render and the offline render of the saved snapshot (1.0 = identical).",
  );
  lines.push("");
  lines.push("Verdict legend:");
  lines.push("- ✅ **good** — SSIM ≥ 0.85 AND ≥1 in-scope FAIL → safe for offline review");
  lines.push("- 🟡 **renders-well-no-fails** — SSIM ≥ 0.85 but no focus-behavior FAILs to repair");
  lines.push("- 🟠 **partial** — SSIM 0.5–0.85 (mostly recognizable but distorted)");
  lines.push("- 🔴 **poor** — SSIM < 0.5 (saved snapshot looks nothing like the live site)");
  lines.push("- ⛔ **excluded** — flagged by D_r dataset as unreliable (IP redirect, 403, bot block)");
  lines.push("- ❌ **online-fail / save-fail / offline-fail** — probe couldn't complete");
  lines.push("");

  const sortKey = (r) => {
    const order = {
      good: 0,
      "renders-well-no-fails": 1,
      partial: 2,
      poor: 3,
      "offline-fail": 4,
      "save-fail": 5,
      "online-fail": 6,
      excluded: 7,
    };
    return [order[r.verdict] ?? 99, -(r.ssim ?? 0), r.url];
  };
  const sorted = [...results].sort((a, b) => {
    const ka = sortKey(a);
    const kb = sortKey(b);
    for (let i = 0; i < ka.length; i++) {
      if (ka[i] < kb[i]) return -1;
      if (ka[i] > kb[i]) return 1;
    }
    return 0;
  });

  lines.push(
    "| Verdict | URL | SSIM | NavA11y FAILs | Live size | Online ms | Offline ms | Notes |",
  );
  lines.push("|---|---|---|---|---|---|---|---|");
  for (const r of sorted) {
    const verdictEmoji =
      { good: "✅", "renders-well-no-fails": "🟡", partial: "🟠", poor: "🔴", excluded: "⛔" }[
        r.verdict
      ] ?? "❌";
    lines.push(
      `| ${verdictEmoji} ${r.verdict} | ${r.url} | ${r.ssim?.toFixed(3) ?? "—"} | ${r.detectFails ?? "—"} | ${fmtBytes(r.liveSize)} | ${r.onlineMs ?? "—"} | ${r.offlineMs ?? "—"} | ${r.excludeReason ?? r.error ?? r.detectError ?? ""} |`,
    );
  }

  lines.push("");
  lines.push("## Recommended for offline manual review");
  const good = sorted.filter((r) => r.verdict === "good");
  if (good.length) {
    for (const r of good) {
      lines.push(
        `- **${r.url}** — SSIM ${r.ssim.toFixed(3)}, ${r.detectFails} FAIL(s). Run \`npm run review -- ${r.url}\``,
      );
    }
  } else {
    lines.push("_(none — use DevTools Option A in REVIEW.md for these sites)_");
  }

  lines.push("");
  lines.push("## How to read this");
  lines.push("");
  lines.push("Sites that score **good** can be reviewed fully offline: open the `-live.html` files in your browser, Tab through, and trust the visual you see. They're the static or server-rendered pages — Wikipedia, Stack Overflow, NIH, etc.");
  lines.push("");
  lines.push("Sites that score **poor** are heavily-dynamic SPAs (Qualtrics, Discord, YouTube, OpenAI) where the saved HTML is missing too much CSS/JS to render meaningfully. For those, use the **DevTools snippet on the live URL** workflow described in any generated REVIEW.md.");
  return lines.join("\n");
}

async function main() {
  const opts = parseArgs(process.argv);
  let sites = await loadDrSites();
  if (opts.include) {
    sites = sites.filter((s) =>
      opts.include.some((needle) => s.url.toLowerCase().includes(needle)),
    );
  }
  sites = sites.slice(0, opts.max);
  console.log(`[probe-dr] ${sites.length} sites to probe`);

  const results = [];
  for (const [i, site] of sites.entries()) {
    const tag = `[${i + 1}/${sites.length}] ${site.url}`;
    if (!site.include) {
      console.log(`${tag}  ⛔ excluded (${site.reason})`);
      results.push(await probeSite(site));
      continue;
    }
    console.log(`${tag}  …`);
    const t0 = Date.now();
    const row = await probeSite(site);
    const totalMs = Date.now() - t0;
    console.log(
      `  → ${row.verdict}  ssim=${row.ssim?.toFixed(3) ?? "—"}  fails=${row.detectFails ?? "—"}  ${totalMs}ms`,
    );
    results.push(row);
  }

  const outDir = join(__dirname, "probe-dr-results");
  await mkdir(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  await writeFile(
    join(outDir, `${stamp}.json`),
    JSON.stringify(results, null, 2),
  );
  const md = renderMd(results);
  await writeFile(join(outDir, `${stamp}.md`), md);
  console.log(`\n[probe-dr] wrote ${outDir}/${stamp}.{json,md}`);
  console.log("\n=== TOP CANDIDATES ===");
  const good = results.filter((r) => r.verdict === "good");
  if (!good.length) {
    console.log("(none — see the .md file)");
  } else {
    for (const r of good) {
      console.log(`  ${r.url}  SSIM=${r.ssim.toFixed(3)}  fails=${r.detectFails}`);
    }
  }
}

main().catch((e) => {
  console.error("[probe-dr] FATAL:", e);
  process.exit(1);
});
