/**
 * Geometry Utilities for Focus Order Analysis
 *
 * Provides spatial ordering and focus jump detection for WCAG 2.4.3 Focus Order validation.
 * Implements reading order heuristics and spatial jump detection.
 */

/**
 * Calculate spatial (visual) reading order for elements
 * Sort by top-to-bottom, left-to-right reading pattern
 *
 * @param {Array} elements - Array of elements with bbox property
 * @returns {Array} - Elements sorted by visual reading order
 */
export function calculateSpatialOrder(elements) {
  if (!Array.isArray(elements) || elements.length === 0) {
    return [];
  }

  return [...elements].sort((a, b) => {
    const aBox = a.bbox;
    const bBox = b.bbox;

    if (!aBox || !bBox) return 0;

    // Vertical threshold: elements on same "line" if within 10px vertically
    const verticalThreshold = 10;
    const verticalDiff = Math.abs(aBox.top - bBox.top);

    if (verticalDiff > verticalThreshold) {
      // Significant vertical separation: sort by Y position (top-to-bottom)
      return aBox.top - bBox.top;
    }

    // On same horizontal line: sort by X position (left-to-right)
    return aBox.left - bBox.left;
  });
}

/**
 * Calculate order divergence between two sequences
 * Measures how different tab order is from DOM order
 *
 * Uses Kendall tau distance (number of pairwise disagreements)
 *
 * @param {Array} domOrder - Elements in DOM order
 * @param {Array} tabOrder - Elements in tab order
 * @returns {number} - Divergence ratio (0-1, where 0=identical, 1=completely reversed)
 */
export function calculateOrderDivergence(domOrder, tabOrder) {
  if (!Array.isArray(domOrder) || !Array.isArray(tabOrder)) {
    return 0;
  }

  if (domOrder.length === 0 || tabOrder.length === 0) {
    return 0;
  }

  // Create mapping of selectors to DOM positions
  const domPositions = new Map();
  domOrder.forEach((el, index) => {
    if (el.selector) {
      domPositions.set(el.selector, index);
    }
  });

  // Count pairwise disagreements
  let disagreements = 0;
  let comparisons = 0;

  for (let i = 0; i < tabOrder.length; i++) {
    for (let j = i + 1; j < tabOrder.length; j++) {
      const el1 = tabOrder[i];
      const el2 = tabOrder[j];

      if (!el1.selector || !el2.selector) continue;

      const domPos1 = domPositions.get(el1.selector);
      const domPos2 = domPositions.get(el2.selector);

      if (domPos1 === undefined || domPos2 === undefined) continue;

      comparisons++;

      // In tab order: el1 comes before el2
      // In DOM order: if el1 position > el2 position, they disagree
      if (domPos1 > domPos2) {
        disagreements++;
      }
    }
  }

  if (comparisons === 0) return 0;

  // Normalize to 0-1 range
  return disagreements / comparisons;
}

/**
 * Compare DOM order vs visual (spatial) order
 * Useful for detecting CSS flexbox/grid reordering
 *
 * @param {Array} domOrder - Elements in DOM order
 * @param {Array} visualOrder - Elements in visual reading order
 * @returns {Object} - { divergence, mismatches }
 */
export function compareDOMvsVisualOrder(domOrder, visualOrder) {
  const divergence = calculateOrderDivergence(domOrder, visualOrder);

  const mismatches = [];
  const visualPositions = new Map();

  visualOrder.forEach((el, index) => {
    if (el.selector) {
      visualPositions.set(el.selector, index);
    }
  });

  domOrder.forEach((el, domIndex) => {
    if (!el.selector) return;

    const visualIndex = visualPositions.get(el.selector);
    if (visualIndex === undefined) return;

    const positionDiff = Math.abs(visualIndex - domIndex);

    // Flag significant mismatches (more than 3 positions different)
    if (positionDiff > 3) {
      mismatches.push({
        selector: el.selector,
        domIndex,
        visualIndex,
        difference: positionDiff,
      });
    }
  });

  return {
    divergence,
    mismatches,
    severity: divergence > 0.5 ? "high" : divergence > 0.3 ? "medium" : "low",
  };
}

/**
 * Detect if element is likely within a modal/dialog container
 * Modals often use focus trapping which is intentional
 *
 * @param {Object} element - Element metadata with selector
 * @returns {boolean} - True if element appears to be in a modal
 */
export function isLikelyInModal(element) {
  if (!element || !element.selector) return false;

  const modalIndicators = [
    "dialog",
    "modal",
    "popup",
    "overlay",
    '[role="dialog"]',
    '[role="alertdialog"]',
    '[aria-modal="true"]',
  ];

  const selector = element.selector.toLowerCase();

  return modalIndicators.some((indicator) => selector.includes(indicator));
}

/**
 * Group elements by semantic container
 * Helps detect when focus jumps between unrelated sections
 *
 * @param {Array} elements - Elements with selector property
 * @returns {Map} - Map of container selectors to element groups
 */
export function groupByContainer(elements) {
  const groups = new Map();

  elements.forEach((el) => {
    if (!el.selector) return;

    // Extract top-level container from selector
    // e.g., "header > nav > a" -> "header"
    const parts = el.selector.split(">").map((p) => p.trim());
    const container = parts[0] || "body";

    if (!groups.has(container)) {
      groups.set(container, []);
    }

    groups.get(container).push(el);
  });

  return groups;
}
