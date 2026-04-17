/**
 * Shared focus indicator detection heuristics
 * Used by both 2.4.7 Focus Visible (AA) and 2.4.13 Focus Appearance (AAA)
 *
 * This module detects ALL types of visual changes when an element receives focus.
 * The consuming checks (2.4.7 vs 2.4.13) apply different thresholds and requirements.
 */

import {
  parseColor,
  getLuminance,
  getContrastRatio,
} from "../utils/color-utils.js";

/**
 * Detect all visual changes between before and after focus states
 * Returns an array of detected changes with measurements
 *
 * @param {Object} before - Before-focus computed styles
 * @param {Object} after - After-focus computed styles
 * @returns {Array} - Array of change objects: { type, confidence, measurement, evidence }
 */
export function detectFocusChanges(before, after) {
  if (!before || !after) {
    return [];
  }

  const changes = [];

  // 1. Outline changes
  const outlineChange = detectOutlineChange(before, after);
  if (outlineChange) changes.push(outlineChange);

  // 2. Box shadow changes
  const shadowChange = detectBoxShadowChange(before, after);
  if (shadowChange) changes.push(shadowChange);

  // 3. Border changes
  const borderChange = detectBorderChange(before, after);
  if (borderChange) changes.push(borderChange);

  // 4. Background color changes (using contrast ratio)
  const bgChange = detectBackgroundChange(before, after);
  if (bgChange) changes.push(bgChange);

  // 5. Text decoration changes
  const textDecChange = detectTextDecorationChange(before, after);
  if (textDecChange) changes.push(textDecChange);

  // 6. Pseudo-element changes (::before, ::after)
  const pseudoChanges = detectPseudoElementChanges(before, after);
  changes.push(...pseudoChanges);

  // 7. Opacity changes
  const opacityChange = detectOpacityChange(before, after);
  if (opacityChange) changes.push(opacityChange);

  // 8. Transform changes (scale, translate, etc.)
  const transformChange = detectTransformChange(before, after);
  if (transformChange) changes.push(transformChange);

  // NOTE: We do NOT check :focus-visible state alone because it's not a visual change.
  // The :focus-visible pseudo-class can be active even when CSS removes the indicator.
  // We only detect actual visual property changes (outline, background, etc.)

  return changes;
}

/**
 * Detect outline changes
 */
function detectOutlineChange(before, after) {
  const beforeWidth = before.outlineWidth || 0;
  const afterWidth = after.outlineWidth || 0;
  const beforeStyle = before.outlineStyle || "none";
  const afterStyle = after.outlineStyle || "none";

  // Outline appeared or grew
  if (afterStyle !== "none" && afterWidth > 0) {
    if (beforeStyle === "none" || beforeWidth === 0) {
      return {
        type: "outline-appeared",
        confidence: "high",
        measurement: { width: afterWidth, style: afterStyle },
        evidence: { beforeWidth, afterWidth, beforeStyle, afterStyle },
      };
    }

    if (afterWidth > beforeWidth + 0.5) {
      return {
        type: "outline-grew",
        confidence: "high",
        measurement: { widthIncrease: afterWidth - beforeWidth },
        evidence: { beforeWidth, afterWidth },
      };
    }
  }

  // Outline offset changed
  const beforeOffset = before.outlineOffset || 0;
  const afterOffset = after.outlineOffset || 0;
  if (
    afterStyle !== "none" &&
    afterWidth > 0 &&
    Math.abs(afterOffset - beforeOffset) > 0.5
  ) {
    return {
      type: "outline-offset-changed",
      confidence: "medium",
      measurement: { offsetChange: Math.abs(afterOffset - beforeOffset) },
      evidence: { beforeOffset, afterOffset },
    };
  }

  return null;
}

/**
 * Detect box shadow changes
 */
function detectBoxShadowChange(before, after) {
  const beforeShadow = before.boxShadow || "none";
  const afterShadow = after.boxShadow || "none";

  if (afterShadow !== "none" && afterShadow !== beforeShadow) {
    return {
      type: "box-shadow-changed",
      confidence: "high",
      measurement: { shadow: afterShadow },
      evidence: { beforeShadow, afterShadow },
    };
  }

  return null;
}

/**
 * Detect border changes
 */
function detectBorderChange(before, after) {
  const widthChanges = [
    {
      side: "top",
      before: before.borderTopWidth || 0,
      after: after.borderTopWidth || 0,
    },
    {
      side: "right",
      before: before.borderRightWidth || 0,
      after: after.borderRightWidth || 0,
    },
    {
      side: "bottom",
      before: before.borderBottomWidth || 0,
      after: after.borderBottomWidth || 0,
    },
    {
      side: "left",
      before: before.borderLeftWidth || 0,
      after: after.borderLeftWidth || 0,
    },
  ];

  const maxIncrease = Math.max(...widthChanges.map((c) => c.after - c.before));

  if (maxIncrease > 1) {
    return {
      type: "border-width-increased",
      confidence: "high",
      measurement: { maxIncrease },
      evidence: { widthChanges },
    };
  }

  // Border DECREASED on focus — this is a negative signal
  // Per W3C Technique F78, styling that removes or reduces visual focus indicators
  // can render the focus indicator non-visible.
  // Reference: https://www.w3.org/WAI/WCAG22/Techniques/failures/F78
  // A decrease of even 1px is significant (e.g. 2px → 1px halves the border)
  const maxDecrease = Math.max(...widthChanges.map((c) => c.before - c.after));
  if (maxDecrease >= 1) {
    return {
      type: "border-width-decreased",
      confidence: "medium",
      measurement: { maxDecrease },
      evidence: { widthChanges },
    };
  }

  // Color change
  const beforeColor = before.borderTopColor || before.borderColor;
  const afterColor = after.borderTopColor || after.borderColor;
  if (beforeColor !== afterColor && after.borderTopWidth > 0) {
    return {
      type: "border-color-changed",
      confidence: "medium",
      measurement: { colorChange: true },
      evidence: { beforeColor, afterColor },
    };
  }

  return null;
}

/**
 * Detect background color changes using proper contrast ratio
 * This is the CORRECT W3C methodology (not luminance delta)
 */
function detectBackgroundChange(before, after) {
  const beforeBg = parseColor(before.backgroundColor);
  const afterBg = parseColor(after.backgroundColor);

  if (!beforeBg || !afterBg) return null;

  // Calculate contrast ratio between before and after backgrounds
  const contrastRatio = getContrastRatio(beforeBg, afterBg);

  // Any perceptible contrast ratio change (> 1.1:1 is detectable)
  if (contrastRatio > 1.1) {
    return {
      type: "background-contrast-changed",
      confidence: "high",
      measurement: { contrastRatio },
      evidence: {
        beforeBg: before.backgroundColor,
        afterBg: after.backgroundColor,
        beforeLuminance: getLuminance(beforeBg),
        afterLuminance: getLuminance(afterBg),
        contrastRatio,
      },
    };
  }

  // Opacity change
  if (Math.abs(afterBg.a - beforeBg.a) > 0.1) {
    return {
      type: "background-opacity-changed",
      confidence: "medium",
      measurement: { opacityChange: Math.abs(afterBg.a - beforeBg.a) },
      evidence: { beforeAlpha: beforeBg.a, afterAlpha: afterBg.a },
    };
  }

  return null;
}

/**
 * Detect text decoration changes
 */
function detectTextDecorationChange(before, after) {
  const beforeLine = before.textDecorationLine || "none";
  const afterLine = after.textDecorationLine || "none";

  if (afterLine !== "none" && afterLine !== beforeLine) {
    return {
      type: "text-decoration-appeared",
      confidence: "high",
      measurement: { decoration: afterLine },
      evidence: { beforeLine, afterLine },
    };
  }

  return null;
}

/**
 * Detect pseudo-element changes (::before, ::after)
 */
function detectPseudoElementChanges(before, after) {
  const changes = [];

  ["before", "after"].forEach((pseudo) => {
    const beforePseudo = before[pseudo];
    const afterPseudo = after[pseudo];

    // Pseudo appeared
    if (!beforePseudo && afterPseudo) {
      changes.push({
        type: `pseudo-${pseudo}-appeared`,
        confidence: "high",
        measurement: { content: afterPseudo.content },
        evidence: { pseudo, afterPseudo },
      });
      return;
    }

    // Pseudo changed
    if (beforePseudo && afterPseudo) {
      if (afterPseudo.backgroundColor !== beforePseudo.backgroundColor) {
        changes.push({
          type: `pseudo-${pseudo}-background-changed`,
          confidence: "medium",
          measurement: { colorChange: true },
          evidence: {
            pseudo,
            beforeColor: beforePseudo.backgroundColor,
            afterColor: afterPseudo.backgroundColor,
          },
        });
      }

      if ((afterPseudo.outlineWidth || 0) > (beforePseudo.outlineWidth || 0)) {
        changes.push({
          type: `pseudo-${pseudo}-outline-appeared`,
          confidence: "high",
          measurement: { width: afterPseudo.outlineWidth },
          evidence: {
            pseudo,
            beforeWidth: beforePseudo.outlineWidth,
            afterWidth: afterPseudo.outlineWidth,
          },
        });
      }
    }
  });

  return changes;
}

/**
 * NOTE: We intentionally do NOT check :focus-visible state
 *
 * The :focus-visible pseudo-class indicates browser state, not visual appearance.
 * CSS can still remove the indicator with: button:focus-visible { outline: none; }
 *
 * We only detect actual visual property changes (outline, background, borders, etc.)
 * This prevents false positives where :focus-visible is active but nothing is visible.
 */

/**
 * Detect opacity changes
 */
function detectOpacityChange(before, after) {
  const beforeOp = before.opacity || 1;
  const afterOp = after.opacity || 1;

  if (Math.abs(afterOp - beforeOp) > 0.1) {
    return {
      type: "opacity-changed",
      confidence: "medium",
      measurement: { opacityChange: Math.abs(afterOp - beforeOp) },
      evidence: { beforeOp, afterOp },
    };
  }

  return null;
}

/**
 * Detect transform changes
 */
function detectTransformChange(before, after) {
  const beforeTransform = before.transform || "none";
  const afterTransform = after.transform || "none";

  if (afterTransform !== "none" && afterTransform !== beforeTransform) {
    return {
      type: "transform-changed",
      confidence: "low",
      measurement: { transform: afterTransform },
      evidence: { beforeTransform, afterTransform },
    };
  }

  return null;
}
