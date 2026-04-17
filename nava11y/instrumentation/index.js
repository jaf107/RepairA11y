window.__ACCESSIBILITY_LOGS__ = [];

window.__logFocusEvent = function (event, type = "focusin") {
  const el = event.target;
  const entry = {
    type: type,
    timestamp: Date.now(),
    selector: window.__getUniqueSelector
      ? window.__getUniqueSelector(el)
      : el.tagName,
    bbox: el.getBoundingClientRect ? el.getBoundingClientRect() : null,
  };
  window.__ACCESSIBILITY_LOGS__.push(entry);
};

window.__snapshotComputedStyle = function (el) {
  if (!el) return null;
  const cs = window.getComputedStyle(el);
  const box = el.getBoundingClientRect();
  return {
    // Capture pseudo-elements often used for focus
    before: window.__snapshotPseudo(el, "::before"),
    after: window.__snapshotPseudo(el, "::after"),

    // Detailed props
    outlineStyle: cs.outlineStyle,
    outlineWidth: parseFloat(cs.outlineWidth) || 0,
    outlineColor: cs.outlineColor,
    outlineOffset: parseFloat(cs.outlineOffset) || 0,

    boxShadow: cs.boxShadow,

    borderTopWidth: parseFloat(cs.borderTopWidth) || 0,
    borderRightWidth: parseFloat(cs.borderRightWidth) || 0,
    borderBottomWidth: parseFloat(cs.borderBottomWidth) || 0,
    borderLeftWidth: parseFloat(cs.borderLeftWidth) || 0,
    borderColor: cs.borderColor,
    borderTopColor: cs.borderTopColor,

    backgroundColor: cs.backgroundColor,
    color: cs.color,
    opacity: parseFloat(cs.opacity),
    transform: cs.transform,
    visibility: cs.visibility,
    display: cs.display,

    textDecoration: cs.textDecoration,
    textDecorationLine: cs.textDecorationLine,
    textDecorationStyle: cs.textDecorationStyle,
    textDecorationColor: cs.textDecorationColor,
    textDecorationThickness: cs.textDecorationThickness,

    fontWeight: cs.fontWeight,
    position: cs.position,
    zIndex: cs.zIndex,
    transition: cs.transition,
    clip: cs.clip,
    clipPath: cs.clipPath,

    filter: cs.filter,
    isFocusVisible: el.matches ? el.matches(":focus-visible") : false,
    bbox: { x: box.x, y: box.y, width: box.width, height: box.height },
  };
};

window.__snapshotPseudo = function (el, pseudo) {
  const cs = window.getComputedStyle(el, pseudo);
  // If content is none or normal, it likely doesn't exist visually
  if (!cs.content || cs.content === "none" || cs.content === "normal")
    return null;
  return {
    content: cs.content,
    outlineStyle: cs.outlineStyle,
    outlineWidth: parseFloat(cs.outlineWidth) || 0,
    outlineColor: cs.outlineColor,
    boxShadow: cs.boxShadow,
    backgroundColor: cs.backgroundColor,
    borderColor: cs.borderColor,
    borderWidth: parseFloat(cs.borderTopWidth) || 0, // Simplified
    position: cs.position,
    top: cs.top,
    left: cs.left,
    width: cs.width,
    height: cs.height,
  };
};

window.__getObscurationData = function (el) {
  if (!el)
    return {
      obscuredRatio: 0,
      isFullyObscured: false,
      isPartiallyObscured: false,
    };

  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    return {
      obscuredRatio: 1,
      isFullyObscured: true,
      isPartiallyObscured: true,
    };
  }

  const viewportWidth =
    window.innerWidth || document.documentElement.clientWidth;
  const viewportHeight =
    window.innerHeight || document.documentElement.clientHeight;

  const top = Math.max(0, Math.floor(rect.top));
  const left = Math.max(0, Math.floor(rect.left));
  const bottom = Math.min(viewportHeight, Math.ceil(rect.bottom));
  const right = Math.min(viewportWidth, Math.ceil(rect.right));

  const visibleWidth = Math.max(0, right - left);
  const visibleHeight = Math.max(0, bottom - top);

  if (visibleWidth === 0 || visibleHeight === 0) {
    // Completely outside viewport
    return {
      obscuredRatio: 1,
      isFullyObscured: true,
      isPartiallyObscured: true,
    };
  }

  const pointsX = 7;
  const pointsY = 7;
  let obscuredPoints = 0;
  let totalPoints = 0;

  const stepX = visibleWidth / (pointsX + 1);
  const stepY = visibleHeight / (pointsY + 1);

  const obscuringElements = new Set();

  for (let i = 1; i <= pointsX; i++) {
    for (let j = 1; j <= pointsY; j++) {
      const x = left + stepX * i;
      const y = top + stepY * j;
      totalPoints++;

      const elementsAtPoint = document.elementsFromPoint(x, y);
      let isObscuredAtPoint = false;

      for (const topEl of elementsAtPoint) {
        if (topEl === el || el.contains(topEl)) {
          // Reached the element or its descendant, so it's visible here
          break;
        }

        const style = window.getComputedStyle(topEl);
        const opacity = parseFloat(style.opacity);

        const bgRaw = style.backgroundColor;
        const isTransparentBg =
          bgRaw === "rgba(0, 0, 0, 0)" || bgRaw === "transparent";
        const hasBg = !isTransparentBg;
        const isReplaced = ["IMG", "VIDEO", "IFRAME", "CANVAS", "SVG"].includes(
          topEl.tagName,
        );
        const hasBackdropFilter =
          style.backdropFilter && style.backdropFilter !== "none";
        const isNativeInput = [
          "BUTTON",
          "INPUT",
          "SELECT",
          "TEXTAREA",
        ].includes(topEl.tagName);

        if (
          opacity > 0.1 &&
          (hasBg || isReplaced || isNativeInput || hasBackdropFilter)
        ) {
          isObscuredAtPoint = true;

          if (topEl.id) {
            obscuringElements.add("#" + topEl.id);
          } else if (topEl.className && typeof topEl.className === "string") {
            obscuringElements.add(
              topEl.tagName.toLowerCase() +
                "." +
                topEl.className.split(" ").join("."),
            );
          } else {
            obscuringElements.add(topEl.tagName.toLowerCase());
          }
          break;
        }
      }

      if (isObscuredAtPoint) {
        obscuredPoints++;
      }
    }
  }

  const obscuredRatio = totalPoints > 0 ? obscuredPoints / totalPoints : 1;
  // Account for float precision. 1.0 could be 0.9999
  const isFullyObscured = obscuredRatio >= 0.99;

  return {
    obscuredRatio,
    isPartiallyObscured: obscuredRatio > 0,
    isFullyObscured,
    obscuredBy: Array.from(obscuringElements),
  };
};

document.addEventListener("focusin", (e) => {
  window.__logFocusEvent(e, "focusin");
});

// Helper to flush logs
window.__flushLogs = function () {
  const logs = [...window.__ACCESSIBILITY_LOGS__];
  window.__ACCESSIBILITY_LOGS__ = [];
  return logs;
};

// ============================================================================
// Focus Navigation Instrumentation (for WCAG 2.4.3 Focus Order)
// ============================================================================

/**
 * Get unique CSS selector for an element
 */
function getUniqueSelector(el) {
  if (!el || !(el instanceof Element)) return "";
  if (el.id) return `#${el.id}`;

  let path = [];
  while (el.nodeType === Node.ELEMENT_NODE) {
    let selector = el.nodeName.toLowerCase();
    if (el.id) {
      selector += `#${el.id}`;
      path.unshift(selector);
      break;
    }
    let sib = el,
      nth = 1;
    while ((sib = sib.previousElementSibling)) {
      if (sib.nodeName.toLowerCase() === selector) nth++;
    }
    if (nth !== 1) selector += `:nth-of-type(${nth})`;
    path.unshift(selector);
    el = el.parentNode;
  }
  return path.join(" > ");
}

/**
 * Capture metadata for currently focused element
 */
window.__captureFocusedElement = function () {
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
        y: bbox.y,
      },
      attributes: {
        id: el.id || null,
        class: el.className || null,
        role: el.getAttribute("role") || null,
        ariaLabel: el.getAttribute("aria-label") || null,
        href: el.getAttribute("href") || null,
        type: el.getAttribute("type") || null,
      },
      visibility: {
        display: computedStyle.display,
        visibility: computedStyle.visibility,
        opacity: parseFloat(computedStyle.opacity) || 1,
      },
      timestamp: Date.now(),
    };
  } catch (error) {
    console.warn("Error capturing focused element:", error);
    return null;
  }
};

/**
 * Get all potentially focusable elements in DOM order
 */
window.__getAllFocusableElements = function () {
  const selector = [
    "a[href]",
    "button",
    "input",
    "select",
    "textarea",
    "summary",
    "iframe",
    "[tabindex]",
    "[contenteditable]",
  ].join(", ");

  const elements = Array.from(document.querySelectorAll(selector));

  return elements
    .filter((el) => {
      if (el.tabIndex < 0) return false;
      if (el.disabled) return false;
      if (el.tagName === "INPUT" && el.type === "hidden") return false;

      if (!el.checkVisibility) {
        const style = window.getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden")
          return false;
      } else {
        if (
          !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
        ) {
          return false;
        }
      }

      if (el.closest("[inert]")) return false;
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
          y: bbox.y,
        },
        attributes: {
          id: el.id || null,
          class: el.className || null,
          role: el.getAttribute("role") || null,
        },
      };
    });
};

// Focus navigation log
window.__FOCUS_NAVIGATION_LOG__ = [];

window.__logFocusNavigation = function (metadata) {
  if (!window.__FOCUS_NAVIGATION_LOG__) {
    window.__FOCUS_NAVIGATION_LOG__ = [];
  }
  window.__FOCUS_NAVIGATION_LOG__.push({
    ...metadata,
    timestamp: Date.now(),
  });
};

console.log(
  "[Instrumentation] Loaded: Focus capture, style snapshot, and focus navigation utilities",
);
