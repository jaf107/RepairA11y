import { SCHEMA_BLOCK, renderEvidence, renderHistory } from "./base.js";

const SC_INSTRUCTIONS = `\
TASK: Repair the SC 2.4.12 (Focus Not Obscured, Enhanced, AAA) violation.

Stricter than 2.4.11: NO part of the focused element may be hidden by
author-controlled content. Even a 1-pixel overlap fails.

Common fix patterns:
  - Raise z-index of the focused element strictly above all obscurers.
  - Eliminate the obscurer entirely or constrain its bounds.
  - Add scroll-padding for sticky/fixed bars.
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
