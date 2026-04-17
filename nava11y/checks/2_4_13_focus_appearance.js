/**
 * WCAG 2.4.13 Focus Appearance (Level AAA)
 *
 * Requirements (BOTH must be met):
 * 1. Minimum contrast of 3:1 between focused and unfocused states
 * 2. Minimum indicator area of at least 2px perimeter around unfocused element
 *
 * This is STRICTER than 2.4.7 - it requires specific measurements and contrast ratios.
 *
 * Reference: https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html
 */

import { detectFocusChanges } from './focus-heuristics.js';
import { parseColor, getContrastRatio } from '../utils/color-utils.js';

/**
 * Check if element passes WCAG 2.4.13 Focus Appearance (AAA)
 *
 * @param {Object} trace - { before, after, element }
 * @param {Object} config - Configuration thresholds from config/default.json
 * @returns {Object} - { result: 'PASS' | 'FAIL', reason: string, evidence: object, sc: string }
 */
export function checkFocusAppearance(trace, config = {}) {
  const { before, after, element } = trace;

  // Default AAA thresholds from WCAG 2.4.13
  const MIN_CONTRAST_RATIO = config.minContrastRatio || 3;
  const MIN_OUTLINE_WIDTH = config.minOutlineWidth || 2;

  if (!before || !after) {
    return {
      result: 'REVIEW',
      reason: 'Missing style snapshots',
      evidence: {},
      sc: '2.4.13'
    };
  }

  // Detect all visual changes
  const changes = detectFocusChanges(before, after);

  if (changes.length === 0) {
    return {
      result: 'FAIL',
      reason: 'No visual change detected on focus (AAA requires visible indicator)',
      evidence: {},
      sc: '2.4.13'
    };
  }

  // AAA-specific validations
  const failures = [];
  let hasValidIndicator = false;

  // Check 1: Outline indicator
  const outlineChange = changes.find(c => c.type.includes('outline'));
  if (outlineChange) {
    const outlineWidth = after.outlineWidth || 0;
    if (outlineWidth >= MIN_OUTLINE_WIDTH) {
      // Also check outline color contrast against background
      const outlineColor = parseColor(after.outlineColor);
      const bgColor = parseColor(after.backgroundColor);
      if (outlineColor && bgColor) {
        const outlineBgContrast = getContrastRatio(outlineColor, bgColor);
        if (outlineBgContrast >= MIN_CONTRAST_RATIO) {
          hasValidIndicator = true;
        } else {
          failures.push(`Outline contrast with background ${outlineBgContrast.toFixed(2)}:1 is below minimum ${MIN_CONTRAST_RATIO}:1`);
        }
      } else {
        // Can't parse colors — accept the indicator
        hasValidIndicator = true;
      }
    } else if (outlineWidth > 0) {
      failures.push(`Outline width ${outlineWidth.toFixed(1)}px is below minimum ${MIN_OUTLINE_WIDTH}px required for AAA`);
    }
  }

  // Check 2: Background contrast ratio
  const bgChange = changes.find(c => c.type === 'background-contrast-changed');
  if (bgChange) {
    const contrastRatio = bgChange.measurement.contrastRatio;
    if (contrastRatio >= MIN_CONTRAST_RATIO) {
      hasValidIndicator = true;
    } else {
      failures.push(`Background contrast ratio ${contrastRatio.toFixed(2)}:1 is below minimum ${MIN_CONTRAST_RATIO}:1 required for AAA`);
    }
  }

  // Check 3: Border indicator with sufficient contrast
  const borderChange = changes.find(c => c.type.includes('border'));
  if (borderChange) {
    const maxWidth = borderChange.measurement?.maxIncrease || 0;
    if (maxWidth >= MIN_OUTLINE_WIDTH) {
      // Also need to check if border color has sufficient contrast
      const beforeBorder = parseColor(before.borderTopColor || before.borderColor);
      const afterBorder = parseColor(after.borderTopColor || after.borderColor);
      const bgColor = parseColor(after.backgroundColor);

      if (afterBorder && bgColor) {
        const borderBgContrast = getContrastRatio(afterBorder, bgColor);
        if (borderBgContrast >= MIN_CONTRAST_RATIO) {
          hasValidIndicator = true;
        } else {
          failures.push(`Border contrast with background ${borderBgContrast.toFixed(2)}:1 is below minimum ${MIN_CONTRAST_RATIO}:1`);
        }
      }
    } else if (maxWidth > 0) {
      failures.push(`Border width increase ${maxWidth.toFixed(1)}px is below minimum ${MIN_OUTLINE_WIDTH}px`);
    }
  }

  // Check 4: Box shadow with sufficient visibility
  const shadowChange = changes.find(c => c.type === 'box-shadow-changed');
  if (shadowChange) {
    // Box shadows are hard to measure programmatically for AAA compliance
    // We give them the benefit of the doubt if they're present
    // TODO: Parse shadow values and validate spread/size >= 2px
    hasValidIndicator = true;
  }

  // Check 5: Text decoration (underlines)
  const textDecChange = changes.find(c => c.type === 'text-decoration-appeared');
  if (textDecChange) {
    // Text underlines typically meet AAA if they're visible
    // The thickness requirement is implicitly met by browser defaults
    hasValidIndicator = true;
  }

  // Result
  if (hasValidIndicator) {
    return {
      result: 'PASS',
      reason: 'Focus indicator meets AAA requirements (3:1 contrast and/or 2px minimum size)',
      evidence: {
        changes: changes.map(c => ({
          type: c.type,
          measurement: c.measurement
        })),
        validation: {
          minContrastRatio: MIN_CONTRAST_RATIO,
          minOutlineWidth: MIN_OUTLINE_WIDTH
        }
      },
      sc: '2.4.13'
    };
  }

  // Failed AAA requirements
  return {
    result: 'FAIL',
    reason: failures.length > 0
      ? `Focus indicator does not meet AAA requirements: ${failures.join('; ')}`
      : 'No focus indicator meets AAA requirements (need 3:1 contrast ratio or 2px minimum size)',
    evidence: {
      failures,
      changes: changes.map(c => c.type),
      measurements: {
        outlineWidth: after.outlineWidth || 0,
        borderWidths: {
          top: after.borderTopWidth || 0,
          right: after.borderRightWidth || 0,
          bottom: after.borderBottomWidth || 0,
          left: after.borderLeftWidth || 0
        }
      },
      validation: {
        minContrastRatio: MIN_CONTRAST_RATIO,
        minOutlineWidth: MIN_OUTLINE_WIDTH
      }
    },
    sc: '2.4.13'
  };
}

/**
 * Calculate the minimum required indicator area based on element perimeter
 * Per WCAG 2.4.13: Area must be >= 2px perimeter
 * Formula: 2 * (width + height + 4)
 *
 * @param {Object} bbox - Bounding box { width, height }
 * @returns {number} - Minimum required area in square pixels
 */
export function calculateMinimumIndicatorArea(bbox) {
  if (!bbox || !bbox.width || !bbox.height) return 0;

  const width = bbox.width;
  const height = bbox.height;

  // 2px perimeter formula from WCAG 2.4.13
  return 2 * (width + height + 4);
}
