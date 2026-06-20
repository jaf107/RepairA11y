import { SCHEMA_BLOCK, renderEvidence, renderHistory } from "./base.js";

const SC_INSTRUCTIONS = `\
TASK: Repair the SC 2.4.7 (Focus Visible, AA) violation.

A passing focus indicator must be visually distinguishable when an element
receives keyboard focus. Any visible change between unfocused and focused
state qualifies (outline, border-change, background-change, box-shadow).

Common fix patterns:
  - Inject a :focus rule with a visible outline (e.g. 2px solid). Use :focus (not :focus-visible).
  - Restore an outline that was suppressed via outline: none.
  - Add a contrasting box-shadow on :focus.
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
