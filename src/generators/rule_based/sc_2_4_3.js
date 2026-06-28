/**
 * Rule-based generator for SC 2.4.3 (Focus Order, Level A).
 *
 * Scope: the positive-tabindex failure (W3C Failure F44). A tabindex value > 0
 * yanks an element ahead of the natural DOM/tab sequence, so the fix is
 * deterministic — reset every offending element's tabindex to "0", which keeps
 * the element keyboard-reachable while restoring natural order.
 *
 * Other 2.4.3 FAIL types NavA11y can emit are intentionally NOT handled here:
 *   - focus-trap / truncated-focus-sequence (F10/F55) — caused by scripting
 *     (onfocus→blur, window.open, redirects); no safe one-shot DOM fix.
 *   - visual-order-mismatch (C27) — caused by CSS layout (flexbox order, float,
 *     grid); a reorder is page-specific and risks regressions.
 * The rule-based generator declines (returns null) on those and leaves them to
 * the LLM generator / manual review.
 *
 * Skip links legitimately use positive tabindex; NavA11y already excludes them
 * from the positive-tabindex violation, so its offender list is safe to trust.
 */
export function generate({ violation }) {
  if (!violation || violation.sc !== "2.4.3" || violation.result !== "FAIL") {
    return null;
  }

  const offenders = positiveTabindexOffenders(violation);
  const selectors = offenders.map((o) => o.selector).filter(Boolean);
  if (selectors.length === 0) {
    return null; // No positive-tabindex offender — not rule-fixable.
  }

  const tabindexList = offenders
    .map((o) => o.tabIndex)
    .filter((t) => t != null)
    .join(", ");

  // Single offender → attr_set; multiple → attr_set_all (one patch must clear
  // the whole page-level violation since the verifier checks full resolution).
  if (selectors.length === 1) {
    return {
      patch_type: "attr_set",
      target_selector: selectors[0],
      payload: { attribute: "tabindex", value: "0" },
      rationale: `Element has positive tabindex (${tabindexList || ">0"}), which forces it ahead of natural DOM order in the tab sequence (W3C Failure F44). Resetting tabindex to 0 restores natural order while keeping the element keyboard-reachable.`,
      wcag_technique_cited: "F44",
    };
  }

  return {
    patch_type: "attr_set_all",
    target_selector: selectors.join(", "),
    payload: { attribute: "tabindex", value: "0" },
    rationale: `${selectors.length} elements use positive tabindex (${tabindexList}), forcing them ahead of natural DOM order in the tab sequence (W3C Failure F44). Resetting each to tabindex 0 restores natural order while keeping them keyboard-reachable.`,
    wcag_technique_cited: "F44",
  };
}

/**
 * Extract the positive-tabindex offenders from a normalized 2.4.3 violation.
 * Prefers NavA11y's structured `positive-tabindex` violation block, then the
 * exported `positiveTabindexElements`, then derives from `tabSequence`.
 */
function positiveTabindexOffenders(violation) {
  const ev = violation.evidence || {};

  const fromViolations = Array.isArray(ev.violations)
    ? ev.violations.find((v) => v.type === "positive-tabindex")?.elements
    : null;
  if (Array.isArray(fromViolations) && fromViolations.length > 0) {
    return fromViolations.filter((e) => Number(e.tabIndex) > 0);
  }

  if (Array.isArray(ev.positiveTabindexElements)) {
    return ev.positiveTabindexElements.filter((e) => Number(e.tabIndex) > 0);
  }

  if (Array.isArray(ev.tabSequence)) {
    return ev.tabSequence.filter((e) => Number(e.tabIndex) > 0);
  }

  return [];
}
