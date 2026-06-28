import { SCHEMA_BLOCK, renderEvidence, renderHistory } from "./base.js";

const SC_INSTRUCTIONS = `\
TASK: Repair the SC 2.4.3 (Focus Order, Level A) violation.

This is a PAGE-LEVEL violation: the keyboard tab sequence does not preserve
meaning and operability. The runtime evidence lists the detected violation
type(s), the captured tab sequence, and any positive-tabindex offenders.

Violation types you may see (in evidence.violations[].type) and how to fix them:

  - "positive-tabindex" (W3C Failure F44): one or more elements have tabindex > 0,
    which forces them ahead of the natural DOM order. FIX: reset every offending
    element's tabindex to "0" (keeps it keyboard-reachable, restores order).
    Use attr_set for a single offender, or attr_set_all with a comma-joined
    selector list for several. This is the most reliable, lowest-risk fix.

  - "visual-order-mismatch" / "small-set-order-mismatch" (W3C Technique C27):
    CSS (flexbox order, float, grid placement) makes the visual reading order
    differ from the DOM/tab order. FIX: prefer neutralizing the reordering CSS
    (e.g. css_inject setting "order: 0 !important" or "float: none !important")
    so DOM order matches visual order, or dom_reorder a single element to its
    visually-correct position. Only do this when the evidence makes the correct
    order unambiguous.

  - "focus-trap" / "truncated-focus-sequence" (W3C Failures F10/F55): focus is
    trapped or redirected by scripting (onfocus→blur, window.open, redirects).
    These usually have NO safe static DOM/CSS fix. If the evidence does not show
    a clear structural cause, DECLINE with { "patch_type": null, "rationale": ... }.

Prefer the smallest change that removes the high-severity violation. Do not
introduce a positive tabindex. Skip links (anchor with href="#..." and a
skip/jump pattern) legitimately keep their tabindex — do not touch them.
`;

export function buildPrompt({ bundle, history }) {
  return [
    SC_INSTRUCTIONS,
    renderEvidence(bundle),
    renderHistory(history),
    SCHEMA_BLOCK,
  ]
    .filter(Boolean)
    .join("\n");
}
