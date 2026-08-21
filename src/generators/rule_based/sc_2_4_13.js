import {
  parseColor,
  contrastRatio,
  adjustColorForContrast,
  toHex,
} from "./_utils/colors.js";

/**
 * Rule-based generator for SC 2.4.13 (Focus Appearance, AAA).
 *
 * Three fix branches:
 *   A. No visible focus indicator → inject 2px outline on :focus (C40).
 *   B. Outline exists but width < 2px → bump width to 2px (preserve color).
 *   C. Outline exists with width ≥ 2px but contrast < 3:1 → adjust color.
 *
 * We emit `:focus` (not `:focus-visible`) because NavA11y simulates focus via
 * JavaScript .focus(), which doesn't always activate `:focus-visible`. `:focus`
 * is the superset and triggers reliably under NavA11y's evaluation.
 */
export function generate({ violation }) {
  if (!violation || violation.sc !== "2.4.13" || violation.result !== "FAIL") {
    return null;
  }
  const selector = violation.element?.selector;
  if (!selector) return null;

  const ev = violation.evidence || {};
  const snapshots = ev.styleSnapshots || ev.snapshots || {};
  const after = snapshots.after || snapshots.afterFocus || {};
  const before = snapshots.before || snapshots.beforeFocus || {};
  const minWidth = ev.validation?.minOutlineWidth ?? 2;
  const minContrast = ev.validation?.minContrastRatio ?? 3;

  const outlineWidth = parseFloat(after.outlineWidth ?? "0");
  const outlineColor = after.outlineColor;
  const bgColor =
    after.effectiveBackgroundColor ||
    before.effectiveBackgroundColor ||
    after.backgroundColor ||
    before.backgroundColor ||
    "rgb(255, 255, 255)";
  const hasVisibleOutline =
    outlineWidth >= 0.5 &&
    outlineColor &&
    outlineColor !== "rgba(0, 0, 0, 0)" &&
    outlineColor !== "transparent";

  // ── Branch A: no indicator at all ────────────────────────────────────
  if (!hasVisibleOutline) {
    return {
      patch_type: "css_inject",
      target_selector: selector,
      payload: {
        rule: `${selector}:focus { outline: 2px solid #000000 !important; outline-offset: 2px !important; }`,
      },
      rationale:
        "No visible focus outline detected (post-focus). Injecting a 2px solid black outline on :focus (W3C technique C40) meeting SC 2.4.13 width and contrast minima.",
      wcag_technique_cited: "C40",
    };
  }

  const outline = parseColor(outlineColor);
  const bg = parseColor(bgColor) || parseColor("#ffffff");
  const currentContrast =
    outline && bg ? contrastRatio(outline, bg) : null;

  // ── Branch B: width below minimum ────────────────────────────────────
  if (outlineWidth < minWidth) {
    // Pick a color guaranteed to meet contrast — prefer black if it works,
    // else white, else binary-search.
    let color = outline;
    if (currentContrast == null || currentContrast < minContrast) {
      color = adjustColorForContrast(outline ?? bg, bg, minContrast) ?? {
        r: 0,
        g: 0,
        b: 0,
        a: 1,
      };
    }
    const hex = toHex(color);
    return {
      patch_type: "css_inject",
      target_selector: selector,
      payload: {
        rule: `${selector}:focus { outline: 2px solid ${hex} !important; outline-offset: 2px !important; }`,
      },
      rationale: `Focus outline width ${outlineWidth}px is below SC 2.4.13 minimum (${minWidth}px). Raised to 2px solid ${hex} (${contrastRatio(color, bg)?.toFixed(2) ?? "?"}:1 contrast).`,
      wcag_technique_cited: "C40",
    };
  }

  // ── Branch C: contrast below 3:1 ────────────────────────────────────
  if (currentContrast != null && currentContrast < minContrast) {
    const better = adjustColorForContrast(outline, bg, minContrast);
    if (!better) {
      return fallbackInjectOutline(selector, bg);
    }
    const newHex = toHex(better);
    return {
      patch_type: "css_inject",
      target_selector: selector,
      payload: {
        rule: `${selector}:focus { outline-color: ${newHex} !important; }`,
      },
      rationale: `Outline color ${outlineColor} achieves ${currentContrast.toFixed(2)}:1 against ${bgColor} (< ${minContrast}:1 minimum). Adjusted to ${newHex} (${contrastRatio(better, bg).toFixed(2)}:1).`,
      wcag_technique_cited: null,
    };
  }

  // ── Branch D: catch-all (FAIL with passing outline → root cause is
  // border/background indicator with insufficient width or contrast).
  // Inject an explicit 2px outline as a universal fix.
  return fallbackInjectOutline(selector, bg);
}

function fallbackInjectOutline(selector, bg) {
  // Pick a color with ≥3:1 against background. Black if it works, white otherwise.
  const candidates = [
    { color: { r: 0, g: 0, b: 0, a: 1 }, hex: "#000000" },
    { color: { r: 255, g: 255, b: 255, a: 1 }, hex: "#ffffff" },
  ];
  let pick = candidates[0];
  for (const c of candidates) {
    if (contrastRatio(c.color, bg) >= 3) {
      pick = c;
      break;
    }
  }
  return {
    patch_type: "css_inject",
    target_selector: selector,
    payload: {
      rule: `${selector}:focus { outline: 2px solid ${pick.hex} !important; outline-offset: 2px !important; }`,
    },
    rationale: `Existing focus indicator (border or background change) does not meet SC 2.4.13 minima. Adding an explicit 2px ${pick.hex} outline on :focus as a supplementary indicator.`,
    wcag_technique_cited: "C40",
  };
}
