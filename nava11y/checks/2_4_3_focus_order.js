/**
 * WCAG 2.4.3 Focus Order (Level A)
 *
 * Requirement: If a Web page can be navigated sequentially and the navigation
 * sequences affect meaning or operation, focusable components receive focus in
 * an order that preserves meaning and operability.
 *
 * This is a PAGE-LEVEL check (runs once per page, not per element).
 *
 * Reference: https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html
 * ACT Rule: No official ACT Rule exists for complete focus order validation
 *
 * Automation Capability: ~60-70% (can detect structural issues, not semantic correctness)
 */

import {
  calculateOrderDivergence,
  calculateSpatialOrder,
  compareDOMvsVisualOrder,
} from "../utils/geometry-utils.js";

/**
 * Check if element is likely a skip link (exception to positive tabindex rule)
 * @param {Object} element - Element metadata
 * @returns {boolean}
 */
function isSkipLink(element) {
  if (!element || element.tabIndex <= 0) return false;

  const selector = (element.selector || "").toLowerCase();
  const tag = (element.tagName || "").toLowerCase();

  // Skip links are typically anchors
  if (tag !== "a") return false;

  // Check if href points to anchor
  const hasAnchorHref = element.attributes?.href?.startsWith("#");

  // Check for common skip link patterns in selector or class
  const skipPatterns = [
    "skip",
    "jump-to",
    "goto",
    "skip-to-main",
    "skip-navigation",
    "skip-to-content",
  ];

  const matchesPattern = skipPatterns.some((pattern) =>
    selector.includes(pattern),
  );

  return hasAnchorHref && matchesPattern;
}

/**
 * Detect positive tabindex violations
 * Reference: W3C Failure Technique F44 — Failure of SC 2.4.3 due to using
 * tabindex to create a tab order that does not preserve meaning and operability
 * https://www.w3.org/WAI/WCAG22/Techniques/failures/F44
 * @param {Array} elements - Elements with tabIndex property
 * @returns {Object|null} - Violation object or null
 */
function detectPositiveTabindexViolations(elements) {
  const positiveTabIndexElements = elements.filter((el) => {
    if (el.tabIndex <= 0) return false;

    // Exception: Skip links are allowed to have positive tabindex
    if (isSkipLink(el)) return false;

    return true;
  });

  if (positiveTabIndexElements.length === 0) {
    return null;
  }

  return {
    type: "positive-tabindex",
    elements: positiveTabIndexElements.map((el) => ({
      selector: el.selector,
      tabIndex: el.tabIndex,
      tagName: el.tagName,
      position: {
        top: el.bbox?.top ?? null,
        left: el.bbox?.left ?? null,
      },
    })),
    count: positiveTabIndexElements.length,
    severity: "high",
    reason: `Found ${positiveTabIndexElements.length} element(s) with positive tabindex values (creates fragile and confusing focus order)`,
    remediation:
      'Remove positive tabindex values and rely on natural DOM order, or use tabindex="0" for custom widgets',
  };
}

/**
 * Check for focus traps (focus gets stuck and can't escape)
 * Reference: WCAG SC 2.1.2 No Keyboard Trap
 * https://www.w3.org/WAI/WCAG22/Understanding/no-keyboard-trap.html
 * W3C Failure Technique F10 — content formats that trap keyboard users
 * https://www.w3.org/WAI/WCAG22/Techniques/failures/F10
 * W3C Failure Technique F55 — script removes focus on receipt
 * https://www.w3.org/WAI/WCAG22/Techniques/failures/F55
 * @param {Array} tabSequence - Tab navigation sequence
 * @returns {Object|null} - Violation object or null
 */
function detectFocusTraps(tabSequence) {
  if (!Array.isArray(tabSequence) || tabSequence.length < 2) {
    return null;
  }

  // Detect if same element appears multiple times consecutively
  const consecutiveRepeats = [];

  for (let i = 1; i < tabSequence.length; i++) {
    const prev = tabSequence[i - 1];
    const curr = tabSequence[i];

    if (prev.selector === curr.selector) {
      consecutiveRepeats.push({
        selector: curr.selector,
        position: i,
      });
    }
  }

  if (consecutiveRepeats.length > 0) {
    return {
      type: "focus-trap",
      elements: [...new Set(consecutiveRepeats.map((r) => r.selector))],
      count: consecutiveRepeats.length,
      severity: "high",
      reason:
        "Focus appears trapped on certain elements (same element receives focus multiple times in sequence)",
      remediation:
        "Ensure all focusable elements can be navigated past using Tab/Shift+Tab",
    };
  }

  return null;
}

/**
 * Detect truncated focus sequences — when Tab traversal reaches far fewer
 * elements than expected, indicating a potential keyboard trap or scripted
 * focus redirect (e.g., window.open(), this.blur()).
 *
 * Reference: W3C Technique F55 — Failure due to script removing focus
 * https://www.w3.org/WAI/WCAG22/Techniques/failures/F55
 *
 * @param {Array} tabSequence - Actual tab navigation sequence
 * @param {Array} domOrder - Elements in DOM order
 * @returns {Object|null} - Violation object or null
 */
function detectTruncatedSequence(tabSequence, domOrder) {
  if (!Array.isArray(domOrder) || domOrder.length < 2) return null;
  if (!Array.isArray(tabSequence)) return null;

  const reachedRatio = tabSequence.length / domOrder.length;

  // If 50% or fewer of expected focusable elements were reached,
  // something prevented normal sequential navigation.
  // For very small sets (2-3 elements), even missing one is significant.
  const isVerySmall = domOrder.length <= 3;
  const threshold = isVerySmall ? 0.6 : 0.5;

  if (reachedRatio < threshold && tabSequence.length < domOrder.length) {
    return {
      type: "truncated-focus-sequence",
      severity: "high",
      reached: tabSequence.length,
      expected: domOrder.length,
      ratio: reachedRatio,
      reason: `Only ${tabSequence.length} of ${domOrder.length} focusable elements were reached via Tab (${(reachedRatio * 100).toFixed(0)}%). Focus may have been trapped or redirected by scripting.`,
      remediation:
        "Check for onfocus handlers that call blur(), window.open(), or redirect focus away from interactive elements",
    };
  }

  return null;
}

/**
 * Detect small-set order mismatches — in sets of ≤ 5 elements, any pairwise
 * divergence is perceptually significant because users see all elements at once.
 *
 * Reference: W3C Technique C27 — Making the DOM order match the visual order
 * https://www.w3.org/WAI/WCAG22/Techniques/css/C27
 *
 * @param {Array} tabSequence - Actual tab navigation sequence
 * @param {number} orderDivergence - Kendall tau divergence (0–1)
 * @returns {Object|null} - Violation object or null
 */
function detectSmallSetMismatch(tabSequence, orderDivergence) {
  const elementCount = tabSequence.length;

  // Only applies to small sets where any swap is immediately noticeable
  if (elementCount > 5 || elementCount < 2) return null;

  // For small sets, any divergence above 0 means at least one element is out of order
  if (orderDivergence > 0) {
    return {
      type: "small-set-order-mismatch",
      severity: "high",
      elementCount,
      divergence: orderDivergence,
      reason: `Focus order diverges from visual order in a small set of ${elementCount} elements (divergence: ${(orderDivergence * 100).toFixed(1)}%). In small sets, any reordering is immediately perceptible.`,
      remediation:
        "Ensure CSS properties (float, flexbox order, grid) do not create a visual order that differs from DOM/tab order",
    };
  }

  return null;
}

/**
 * Main WCAG 2.4.3 Focus Order check
 *
 * @param {Object} pageData - Page-level data
 * @param {Array} pageData.tabSequence - Actual tab navigation sequence
 * @param {Array} pageData.domOrder - Elements in DOM order
 * @param {string} pageData.url - Page URL
 * @param {Object} config - Configuration thresholds
 * @returns {Object} - { result, reason, evidence, violations, sc }
 */
export function checkFocusOrder(pageData, config = {}) {
  const { tabSequence = [], domOrder = [], url } = pageData;

  // Default configuration
  const cfg = {
    maxOrderDivergence: config.maxOrderDivergence || 0.3,
    ...config,
  };

  const violations = [];

  // Validation
  if (!Array.isArray(tabSequence) || tabSequence.length === 0) {
    return {
      result: "REVIEW",
      reason:
        "No tab sequence captured (page may have no focusable elements or Tab navigation failed)",
      evidence: { tabSequence, domOrder },
      violations: [],
      sc: "2.4.3",
    };
  }

  // 1. Check for positive tabindex values (common WCAG 2.4.3 failure)
  const positiveTabindexViolation =
    detectPositiveTabindexViolations(tabSequence);
  if (positiveTabindexViolation) {
    violations.push(positiveTabindexViolation);
  }

  // 2. Check for focus traps
  const focusTrapViolation = detectFocusTraps(tabSequence);
  if (focusTrapViolation) {
    violations.push(focusTrapViolation);
  }

  // 3. Check for truncated focus sequences (potential trap/redirect)
  const truncatedViolation = detectTruncatedSequence(tabSequence, domOrder);
  if (truncatedViolation) {
    violations.push(truncatedViolation);
  }

  // 4. Compare DOM order vs Tab order using normalised Kendall tau distance
  // Reference: M. G. Kendall, "A New Measure of Rank Correlation,"
  // Biometrika, vol. 30, no. 1/2, pp. 81–93, 1938. DOI: 10.2307/2332226
  let orderDivergence = 0;
  if (domOrder.length > 0 && tabSequence.length > 0) {
    orderDivergence = calculateOrderDivergence(domOrder, tabSequence);

    if (orderDivergence > cfg.maxOrderDivergence) {
      violations.push({
        type: "order-divergence",
        percentage: (orderDivergence * 100).toFixed(1),
        threshold: (cfg.maxOrderDivergence * 100).toFixed(1),
        severity: "medium",
        reason: `Tab order significantly differs from DOM order (${(orderDivergence * 100).toFixed(1)}% divergence, threshold: ${(cfg.maxOrderDivergence * 100).toFixed(1)}%)`,
        remediation:
          "Manual review required: Verify tab order preserves meaning and operability for this specific content",
      });
    }
  }

  // 4b. Small-set sensitivity — any divergence in ≤ 5 elements is significant
  const smallSetViolation = detectSmallSetMismatch(
    tabSequence,
    orderDivergence,
  );
  if (smallSetViolation) {
    violations.push(smallSetViolation);
  }

  // 5. Compare visual order vs tab order (detects CSS reordering)
  // Per W3C Technique C27, the DOM order should match the visual order.
  // Reference: https://www.w3.org/WAI/WCAG22/Techniques/css/C27
  const visualOrder = calculateSpatialOrder(tabSequence);
  const visualComparison = compareDOMvsVisualOrder(tabSequence, visualOrder);

  // For small sets (≤ 5 elements), any visual/tab order mismatch is immediately
  // perceptible to the user. We use a lower threshold for these cases.
  const elementCount = tabSequence.length;
  const isSmallSet = elementCount >= 2 && elementCount <= 5;
  const visualDivergence = visualComparison.divergence;

  if (isSmallSet && visualDivergence > 0) {
    // In small sets, any reordering is significant (W3C Technique C27)
    violations.push({
      type: "visual-order-mismatch",
      divergence: (visualDivergence * 100).toFixed(1),
      mismatches: visualComparison.mismatches,
      severity: "high",
      reason: `Tab order does not match visual reading order in a small set of ${elementCount} elements (${(visualDivergence * 100).toFixed(1)}% divergence). CSS properties may be reordering content visually.`,
      remediation:
        "Ensure CSS properties (float, flexbox order, grid) do not create a visual order that differs from DOM/tab order (W3C Technique C27)",
    });
  } else if (
    visualComparison.severity === "high" ||
    (visualComparison.severity === "medium" && visualDivergence > 0.3)
  ) {
    violations.push({
      type: "visual-order-mismatch",
      divergence: (visualDivergence * 100).toFixed(1),
      mismatches: visualComparison.mismatches.slice(0, 5), // Top 5 mismatches
      severity: "medium",
      reason: `Visual reading order differs significantly from tab order (${(visualDivergence * 100).toFixed(1)}% divergence)`,
      remediation:
        "Verify CSS properties (flexbox, grid, float) are not creating confusing tab order",
    });
  }

  // Classify overall result
  const highSeverityViolations = violations.filter(
    (v) => v.severity === "high",
  );
  const mediumSeverityViolations = violations.filter(
    (v) => v.severity === "medium",
  );

  const positiveTabindexElements =
    violations.find((v) => v.type === "positive-tabindex")?.elements || [];

  if (highSeverityViolations.length > 0) {
    return {
      result: "FAIL",
      reason: `Found ${highSeverityViolations.length} high-severity focus order violation(s)`,
      evidence: {
        violations,
        tabSequence: tabSequence.map((el) => ({
          selector: el.selector,
          tabIndex: el.tabIndex,
          position: { top: el.bbox?.top, left: el.bbox?.left },
        })),
        positiveTabindexElements,
        summary: {
          totalFocusable: tabSequence.length,
          positiveTabindex:
            violations.find((v) => v.type === "positive-tabindex")?.count || 0,
          orderDivergence: orderDivergence.toFixed(2),
        },
      },
      violations,
      sc: "2.4.3",
    };
  }

  if (mediumSeverityViolations.length > 0) {
    return {
      result: "REVIEW",
      reason: `Found ${mediumSeverityViolations.length} potential focus order issue(s) requiring manual verification`,
      evidence: {
        violations,
        tabSequence: tabSequence.map((el) => ({
          selector: el.selector,
          tabIndex: el.tabIndex,
          position: { top: el.bbox?.top, left: el.bbox?.left },
        })),
        positiveTabindexElements,
        summary: {
          totalFocusable: tabSequence.length,
          orderDivergence: orderDivergence.toFixed(2),
        },
      },
      violations,
      sc: "2.4.3",
    };
  }

  // No violations detected
  return {
    result: "PASS",
    reason: "No detectable focus order violations",
    evidence: {
      tabSequence: tabSequence.map((el) => ({
        selector: el.selector,
        tabIndex: el.tabIndex,
      })),
      summary: {
        totalFocusable: tabSequence.length,
        orderDivergence: orderDivergence.toFixed(2),
      },
    },
    violations: [],
    sc: "2.4.3",
  };
}
