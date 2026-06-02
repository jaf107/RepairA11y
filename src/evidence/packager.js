import { readFile } from "node:fs/promises";
import { techniqueText } from "./techniques/index.js";

/**
 * Evidence packager — the RQ2 ablation lever.
 *
 * Produces a bundle at one of four levels:
 *   E1: outerHTML + full-page screenshot reference
 *   E2: E1 + WCAG technique text
 *   E3: E2 + per-SC runtime slice (style snapshots, contrast, obscurer data,
 *       tab sequence) — sourced from NavA11y's exported `evidence` field
 *   E4: E3 + annotated element-crop screenshot (base64 PNG with red bbox)
 *
 * Inputs:
 *   violation      — normalized violation record (from detector)
 *   level          — 'E1' | 'E2' | 'E3' | 'E4'
 *   htmlPath       — optional fixture path to read outerHTML from
 *                    (preferred over violation.element.outerHTML when present)
 *   screenshotPath — optional path to baseline screenshot
 *   annotator      — optional async ({screenshotPath, bbox}) => Buffer
 *                    Allows the heavy E4 dependency (sharp) to be injected.
 *
 * Returns an object with deterministic key order so RQ2 can hash-dedupe.
 */
export async function packageEvidence(opts) {
  const {
    violation,
    level = "E3",
    htmlPath,
    screenshotPath,
    annotator,
  } = opts;
  if (!violation) throw new Error("packageEvidence: violation required");
  if (!["E1", "E2", "E3", "E4"].includes(level)) {
    throw new Error(`packageEvidence: invalid level '${level}'`);
  }

  const bundle = {
    level,
    sc: violation.sc,
    violationId: violation.id,
    element: await buildElementBlock(violation, htmlPath),
    screenshot: { fullPagePath: screenshotPath ?? violation.screenshot ?? null },
  };

  if (level === "E1") return bundle;

  bundle.wcagTechniques = techniqueText(violation.sc);

  if (level === "E2") return bundle;

  bundle.runtimeSlice = extractRuntimeSlice(violation);

  if (level === "E3") return bundle;

  // E4 — annotated crop. Only invoke annotator when bbox available.
  const bbox = violation.element?.bbox ?? null;
  if (annotator && bbox && bundle.screenshot.fullPagePath) {
    try {
      const buf = await annotator({
        screenshotPath: bundle.screenshot.fullPagePath,
        bbox,
        sc: violation.sc,
      });
      bundle.screenshot.annotatedCropBase64 = buf?.toString("base64") ?? null;
    } catch (e) {
      bundle.screenshot.annotationError = e.message;
    }
  } else {
    bundle.screenshot.annotationSkipped = "missing annotator/bbox/screenshot";
  }
  return bundle;
}

async function buildElementBlock(violation, htmlPath) {
  const el = violation.element || {};
  const block = {
    selector: el.selector ?? null,
    tagName: el.tagName ?? null,
    bbox: el.bbox ?? null,
    attributes: el.attributes ?? null,
    visibility: el.visibility ?? null,
    outerHTML: violation.raw?.element?.outerHTML ?? null,
  };
  if (!block.outerHTML && htmlPath && el.selector) {
    block.outerHTML = await extractOuterHTML(htmlPath, el.selector).catch(
      () => null,
    );
  }
  if (!block.outerHTML && htmlPath) {
    // Fall back to the full file when selector-based extraction unavailable.
    block.documentHTML = await readFile(htmlPath, "utf8").catch(() => null);
  }
  return block;
}

async function extractOuterHTML(htmlPath, selector) {
  // Pure string-extraction would require a DOM parser. Defer to Playwright
  // when the caller wants exact outerHTML — for E1/E2/E3 the fallback
  // (full document) is acceptable. Kept as an async hook so a future
  // injection (e.g., via verifier's already-open browser) can fill it.
  return null;
}

function extractRuntimeSlice(violation) {
  const ev = violation.evidence || {};
  const slice = { sc: violation.sc };

  if (violation.sc === "2.4.7" || violation.sc === "2.4.13") {
    slice.styleSnapshots = ev.styleSnapshots ?? ev.snapshots ?? null;
    slice.measurements = ev.measurements ?? null;
    slice.contrast = ev.contrast ?? ev.contrastRatio ?? null;
    slice.failures = ev.failures ?? null;
    slice.changes = ev.changes ?? null;
  } else if (violation.sc === "2.4.11" || violation.sc === "2.4.12") {
    slice.obscuredRatio = ev.obscuredRatio ?? null;
    slice.obscuredBy = ev.obscuredBy ?? null;
    slice.obscurers = ev.obscurers ?? null;
    slice.measurements = ev.measurements ?? null;
  } else if (violation.sc === "2.4.3") {
    slice.violations = ev.violations ?? null;
    slice.tabSequence = ev.tabSequence ?? null;
    slice.positiveTabindexElements = ev.positiveTabindexElements ?? null;
  }

  // Pass through any extra evidence keys the schema didn't anticipate.
  for (const [k, v] of Object.entries(ev)) {
    if (!(k in slice) && v != null) slice[k] = v;
  }
  return slice;
}

/**
 * Default annotator using `sharp` (lazy-loaded — keeps E1-E3 paths sharp-free).
 * Pass this into packageEvidence as the `annotator` argument when running E4.
 */
export async function defaultAnnotator({ screenshotPath, bbox }) {
  const sharp = (await import("sharp")).default;
  const pad = 40;
  const overlay = Buffer.from(
    `<svg width="${bbox.width + pad * 2}" height="${bbox.height + pad * 2}">
      <rect x="${pad}" y="${pad}" width="${bbox.width}" height="${bbox.height}"
        fill="none" stroke="red" stroke-width="3" />
    </svg>`,
  );
  return sharp(screenshotPath)
    .extract({
      left: Math.max(0, Math.floor(bbox.x ?? bbox.left) - pad),
      top: Math.max(0, Math.floor(bbox.y ?? bbox.top) - pad),
      width: Math.floor(bbox.width) + pad * 2,
      height: Math.floor(bbox.height) + pad * 2,
    })
    .composite([{ input: overlay, top: 0, left: 0 }])
    .png()
    .toBuffer();
}
