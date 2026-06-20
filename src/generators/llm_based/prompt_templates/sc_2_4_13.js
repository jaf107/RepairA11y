import { SCHEMA_BLOCK, renderEvidence, renderHistory } from "./base.js";

const SC_INSTRUCTIONS = `\
TASK: Repair the SC 2.4.13 (Focus Appearance, AAA) violation.

A passing focus indicator must:
  (a) cover an area at least as large as a 2 CSS pixel solid perimeter, AND
  (b) have a contrast ratio of at least 3:1 between the same pixels in the
      focused and unfocused states.

Common fix patterns for this SC:
  - Inject a :focus rule with outline: 2px solid <high-contrast color>
    when no indicator exists. Use :focus (not :focus-visible).
  - Adjust outline-color (or border-color) to a value with ≥3:1 contrast
    against the element's backdrop, preserving width/area.
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
