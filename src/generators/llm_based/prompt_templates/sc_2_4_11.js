import { SCHEMA_BLOCK, renderEvidence, renderHistory } from "./base.js";

const SC_INSTRUCTIONS = `\
TASK: Repair the SC 2.4.11 (Focus Not Obscured, Minimum, AA) violation.

The focused element is partially or fully covered by another element
(usually a fixed header, footer, or floating widget). A passing fix ensures
no part of the focused element is hidden by author-controlled content.

Common fix patterns:
  - Raise z-index of the focused element above the obscurer.
  - Add scroll-padding-top / scroll-padding-bottom to compensate for fixed bars.
  - Convert fixed positioning to sticky so the obscurer scrolls with content.
  - Reduce or reposition the obscurer.

Use the runtime evidence below — it lists the obscurer's selector and z-index.
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
