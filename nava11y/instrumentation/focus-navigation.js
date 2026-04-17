/**
 * Focus Navigation Instrumentation
 *
 * Provides utilities for capturing Tab navigation sequence and element metadata.
 * Used by WCAG 2.4.3 Focus Order validation.
 *
 * Note: Actual Tab key presses must be triggered via Playwright's keyboard API,
 * as synthetic KeyboardEvent dispatch does not trigger native browser focus behavior.
 */

/**
 * Get unique CSS selector for an element
 * @param {Element} el - Target element
 * @returns {string} - CSS selector
 */
function getUniqueSelector(el) {
  if (!el || !(el instanceof Element)) return '';

  if (el.id) return `#${el.id}`;

  let path = [];
  while (el.nodeType === Node.ELEMENT_NODE) {
    let selector = el.nodeName.toLowerCase();

    if (el.id) {
      selector += `#${el.id}`;
      path.unshift(selector);
      break;
    }

    // Add nth-of-type for specificity
    let sib = el, nth = 1;
    while (sib = sib.previousElementSibling) {
      if (sib.nodeName.toLowerCase() === selector) nth++;
    }
    if (nth !== 1) selector += `:nth-of-type(${nth})`;

    path.unshift(selector);
    el = el.parentNode;
  }

  return path.join(' > ');
}

/**
 * Capture metadata for currently focused element
 * @returns {Object|null} - Element metadata or null if no focus
 */
window.__captureFocusedElement = function() {
  const el = document.activeElement;

  if (!el || el === document.body || el === document.documentElement) {
    return null;
  }

  try {
    const bbox = el.getBoundingClientRect();
    const computedStyle = window.getComputedStyle(el);

    return {
      selector: getUniqueSelector(el),
      tagName: el.tagName.toLowerCase(),
      tabIndex: el.tabIndex,
      bbox: {
        top: bbox.top,
        left: bbox.left,
        bottom: bbox.bottom,
        right: bbox.right,
        width: bbox.width,
        height: bbox.height,
        x: bbox.x,
        y: bbox.y
      },
      attributes: {
        id: el.id || null,
        class: el.className || null,
        role: el.getAttribute('role') || null,
        ariaLabel: el.getAttribute('aria-label') || null,
        href: el.getAttribute('href') || null,
        type: el.getAttribute('type') || null
      },
      visibility: {
        display: computedStyle.display,
        visibility: computedStyle.visibility,
        opacity: parseFloat(computedStyle.opacity) || 1
      },
      timestamp: Date.now()
    };
  } catch (error) {
    console.warn('Error capturing focused element:', error);
    return null;
  }
};

/**
 * Get all potentially focusable elements in DOM order
 * @returns {Array} - Array of element metadata
 */
window.__getAllFocusableElements = function() {
  // WCAG-compliant focusable element selector
  const selector = [
    'a[href]',
    'button',
    'input',
    'select',
    'textarea',
    'summary',
    'iframe',
    '[tabindex]',
    '[contenteditable]'
  ].join(', ');

  const elements = Array.from(document.querySelectorAll(selector));

  return elements
    .filter(el => {
      // Exclude elements with negative tabindex (not in tab order)
      if (el.tabIndex < 0) return false;

      // Exclude disabled elements
      if (el.disabled) return false;

      // Exclude hidden inputs
      if (el.tagName === 'INPUT' && el.type === 'hidden') return false;

      // Check visibility
      if (!el.checkVisibility) {
        // Fallback for older browsers
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
      } else {
        if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) {
          return false;
        }
      }

      // Exclude inert elements
      if (el.closest('[inert]')) return false;

      return true;
    })
    .map((el, index) => {
      const bbox = el.getBoundingClientRect();

      return {
        domIndex: index,
        selector: getUniqueSelector(el),
        tagName: el.tagName.toLowerCase(),
        tabIndex: el.tabIndex,
        bbox: {
          top: bbox.top,
          left: bbox.left,
          bottom: bbox.bottom,
          right: bbox.right,
          width: bbox.width,
          height: bbox.height,
          x: bbox.x,
          y: bbox.y
        },
        attributes: {
          id: el.id || null,
          class: el.className || null,
          role: el.getAttribute('role') || null
        }
      };
    });
};

/**
 * Check if an element is a skip link (positive tabindex exception)
 * @param {Element} el - Target element
 * @returns {boolean} - True if element is likely a skip link
 */
window.__isSkipLink = function(el) {
  if (!el || el.tagIndex <= 0) return false;

  // Skip links are typically anchors with href starting with #
  if (el.tagName !== 'A' || !el.hasAttribute('href')) return false;

  const href = el.getAttribute('href');
  if (!href || !href.startsWith('#')) return false;

  // Check for common skip link text patterns
  const text = (el.textContent || '').toLowerCase().trim();
  const skipPatterns = [
    'skip',
    'jump to',
    'go to',
    'skip to main',
    'skip navigation',
    'skip to content'
  ];

  return skipPatterns.some(pattern => text.includes(pattern));
};

/**
 * Initialize focus navigation logging
 */
window.__FOCUS_NAVIGATION_LOG__ = [];

window.__logFocusNavigation = function(metadata) {
  if (!window.__FOCUS_NAVIGATION_LOG__) {
    window.__FOCUS_NAVIGATION_LOG__ = [];
  }

  window.__FOCUS_NAVIGATION_LOG__.push({
    ...metadata,
    timestamp: Date.now()
  });
};

console.log('[Focus Navigation Instrumentation] Loaded successfully');
