/**
 * WCAG 2.4.7 Focus Visible (Level AA)
 *
 * Requirement: Any keyboard operable user interface has a mode of operation
 * where the keyboard focus indicator is visible.
 *
 * This is the BASELINE check - it only requires SOME visible change.
 * No specific contrast ratios, sizes, or thresholds are mandated by AA.
 *
 * Reference: https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html
 * ACT Rule: https://www.w3.org/WAI/standards-guidelines/act/rules/oj04fd/
 */

import { detectFocusChanges } from "./focus-heuristics.js";

/**
 * Check if element passes WCAG 2.4.7 Focus Visible
 *
 * @param {Object} trace - { before, after, element }
 * @returns {Object} - { result: 'PASS' | 'FAIL', reason: string, evidence: object, sc: string }
 */
export function checkFocusAppearance(trace) {
  const { before, after, element } = trace;

  if (!before || !after) {
    return {
      result: "REVIEW",
      reason: "Missing style snapshots",
      evidence: {},
      sc: "2.4.7",
    };
  }

  // Detect all visual changes using shared heuristics
  const changes = detectFocusChanges(before, after);

  // 2.4.7 (AA) only requires ANY visible change
  // If we detected any change with medium or high confidence, it passes
  const significantChanges = changes.filter(
    (c) => c.confidence === "high" || c.confidence === "medium",
  );

  // Check for regressions: border decreasing on focus is a NEGATIVE signal.
  // Per W3C Technique F78, styling that removes or reduces the visual focus
  // indicator can render it non-visible.
  // Reference: https://www.w3.org/WAI/WCAG22/Techniques/failures/F78
  const hasRegression = changes.some(
    (c) => c.type === "border-width-decreased",
  );
  const positiveChanges = significantChanges.filter(
    (c) => c.type !== "border-width-decreased",
  );

  if (hasRegression && positiveChanges.length > 0) {
    // A positive indicator appeared (e.g., outline) but the border also shrank.
    // Check if the new indicator is at least as prominent as what was removed.
    const regression = changes.find((c) => c.type === "border-width-decreased");
    const bestPositive = positiveChanges[0];
    const addedWidth =
      bestPositive.measurement?.width ||
      bestPositive.measurement?.widthIncrease ||
      0;
    const removedWidth = regression.measurement?.maxDecrease || 0;

    if (addedWidth <= removedWidth) {
      // Net visual effect is no more prominent than what was removed — fail.
      // When addedWidth == removedWidth the element looks the same focused
      // vs unfocused, so focus is not visibly indicated.
      return {
        result: "FAIL",
        reason: `Focus indicator is not more prominent than the removed border (added ${addedWidth}px, removed ${removedWidth}px)`,
        evidence: {
          regression: regression.measurement,
          bestPositive: bestPositive.measurement,
          allChanges: changes.map((c) => c.type),
        },
        sc: "2.4.7",
      };
    }
  }

  if (hasRegression && positiveChanges.length === 0) {
    // Border decreased with no compensating positive indicator — fail
    return {
      result: "FAIL",
      reason: "Border decreased on focus with no compensating focus indicator",
      evidence: {
        allChanges: changes.map((c) => c.type),
      },
      sc: "2.4.7",
    };
  }

  if (significantChanges.length > 0) {
    // Use the first high-confidence change for the reason
    const primaryChange =
      changes.find((c) => c.confidence === "high") || significantChanges[0];

    return {
      result: "PASS",
      reason: formatChangeReason(primaryChange),
      evidence: {
        changeType: primaryChange.type,
        measurement: primaryChange.measurement,
        allChanges: changes.map((c) => c.type),
      },
      sc: "2.4.7",
    };
  }

  // No detectable visual change
  return {
    result: "FAIL",
    reason: "No significant visual change detected on focus",
    evidence: {
      before: {
        outlineWidth: before.outlineWidth,
        outlineStyle: before.outlineStyle,
        backgroundColor: before.backgroundColor,
        boxShadow: before.boxShadow,
      },
      after: {
        outlineWidth: after.outlineWidth,
        outlineStyle: after.outlineStyle,
        backgroundColor: after.backgroundColor,
        boxShadow: after.boxShadow,
      },
    },
    sc: "2.4.7",
  };
}

/**
 * Format a change object into a human-readable reason
 */
function formatChangeReason(change) {
  const m = change.measurement || {};

  const reasons = {
    "outline-appeared": "Outline appeared on focus",
    "outline-grew": `Outline width increased by ${m.widthIncrease ? m.widthIncrease.toFixed(1) : "?"}px`,
    "outline-offset-changed": "Outline offset changed",
    "box-shadow-changed": "Box shadow changed",
    "border-width-increased": `Border width increased by ${m.maxIncrease ? m.maxIncrease.toFixed(1) : "?"}px`,
    "border-width-decreased": `Border width decreased by ${m.maxDecrease ? m.maxDecrease.toFixed(1) : "?"}px (regression)`,
    "border-color-changed": "Border color changed",
    "background-contrast-changed": `Background contrast changed (${m.contrastRatio ? m.contrastRatio.toFixed(2) : "?"}:1 ratio)`,
    "background-opacity-changed": "Background opacity changed",
    "text-decoration-appeared": `Text decoration appeared${m.decoration ? ` (${m.decoration})` : ""}`,
    "pseudo-before-appeared": "::before pseudo-element appeared",
    "pseudo-after-appeared": "::after pseudo-element appeared",
    "pseudo-before-background-changed":
      "::before pseudo-element background changed",
    "pseudo-after-background-changed":
      "::after pseudo-element background changed",
    "pseudo-before-outline-appeared":
      "::before pseudo-element outline appeared",
    "pseudo-after-outline-appeared": "::after pseudo-element outline appeared",
    "opacity-changed": "Opacity changed",
    "transform-changed": "Transform changed",
  };

  return reasons[change.type] || `Visual change detected: ${change.type}`;
}
