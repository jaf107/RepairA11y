import {
  parseColor,
  contrastRatio,
  adjustColorForContrast,
  toHex,
} from "./_utils/colors.js";

/**
 * Rule-based generator for SC 2.4.7 (Focus Visible, AA).
 *
 * Strategy:
 *   1. If no visible focus indicator (no outline, no contrasting border/bg
 *      change, no box-shadow change) → inject 2px solid outline on
 *      :focus-visible (technique C15).
 *   2. If outline exists but contrast is below 3:1 against backdrop → adjust
 *      outline color the same way as the SC 2.4.13 generator.
 *
 * SC 2.4.7 is the AA-level cousin of 2.4.13 — same fixes work but the
 * acceptance bar is lower (any visible change is enough).
 */
export function generate({ violation }) {
  if (!violation || violation.sc !== "2.4.7" || violation.result !== "FAIL") {
    return null;
  }
  const selector = violation.element?.selector;
  if (!selector) return null;

  const ev = violation.evidence || {};
  const snapshots = ev.styleSnapshots || ev.snapshots || {};
  const after = snapshots.after || snapshots.afterFocus || {};
  const before = snapshots.before || snapshots.beforeFocus || {};

  const hasOutline =
    after.outlineWidth &&
    parseFloat(after.outlineWidth) >= 1 &&
    after.outlineColor &&
    after.outlineColor !== "rgba(0, 0, 0, 0)" &&
    after.outlineColor !== "transparent";

  const changedBorderOrBg =
    (before.borderTopColor !== after.borderTopColor &&
      after.borderTopColor != null) ||
    (before.backgroundColor !== after.backgroundColor &&
      after.backgroundColor != null) ||
    (before.boxShadow !== after.boxShadow &&
      after.boxShadow && after.boxShadow !== "none");

  if (!hasOutline && !changedBorderOrBg) {
    return {
      patch_type: "css_inject",
      target_selector: selector,
      payload: {
        rule: `${selector}:focus { outline: 2px solid #000000; outline-offset: 2px; }`,
      },
      rationale:
        "No visible focus indicator detected (no outline, no border/background/box-shadow change on focus). Injecting a 2px solid black :focus-visible outline (W3C technique C15).",
      wcag_technique_cited: "C15",
    };
  }

  if (hasOutline) {
    const outlineCol = parseColor(after.outlineColor);
    const bgCol =
    parseColor(after.effectiveBackgroundColor) ||
    parseColor(after.backgroundColor) ||
    parseColor("#ffffff");
    if (outlineCol && bgCol) {
      const cur = contrastRatio(outlineCol, bgCol);
      if (cur != null && cur < 3) {
        const fixed = adjustColorForContrast(outlineCol, bgCol, 3.0);
        if (fixed) {
          const newHex = toHex(fixed);
          return {
            patch_type: "css_inject",
            target_selector: selector,
            payload: {
              rule: `${selector}:focus { outline-color: ${newHex}; }`,
            },
            rationale: `Outline contrast ${cur.toFixed(2)}:1 too low. Adjusted to ${newHex} (${contrastRatio(fixed, bgCol).toFixed(2)}:1).`,
            wcag_technique_cited: null,
          };
        }
      }
    }
  }

  return null;
}
