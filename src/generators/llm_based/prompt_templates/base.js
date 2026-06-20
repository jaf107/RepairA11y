/**
 * Shared prompt building blocks for LLM-based generators.
 *
 * Each SC × evidence-level combination assembles a prompt from these blocks
 * plus per-SC instructions. Keeping the prompts code-built (rather than
 * markdown templates) means we can deterministically hash them by content
 * for experiment provenance.
 */

export const SCHEMA_BLOCK = `\
RESPOND WITH A SINGLE JSON OBJECT, NO PROSE, NO MARKDOWN FENCES.
The JSON must conform to this schema (use exactly one patch_type):

{
  "patch_type": "css_inject" | "attr_set" | "style_override" | "dom_reorder",
  "target_selector": "<CSS selector string>",
  "payload": <type-specific object>,
  "rationale": "<short string explaining the fix>",
  "wcag_technique_cited": "C15" | "C27" | "C40" | "F44" | "F78" | "G1" | null
}

Payload shape per patch_type:
- css_inject:    { "rule": "selector { property: value; }" }
- attr_set:      { "attribute": "<name>", "value": "<string|null>" }
- style_override: { "property": "<css-prop>", "value": "<string>" }
- dom_reorder:   { "parent_selector": "<sel>", "insert_before_selector": "<sel|null>" }

RULES:
- Use :focus (NOT :focus-visible) for keyboard focus indicators. The verifier triggers focus via JavaScript .focus(), which does not activate :focus-visible. :focus is the correct pseudo-class.
- Always add !important to every CSS property in your injected rule to override existing author styles regardless of selector specificity.
- Prefer the smallest change that resolves the violation.
- If you cannot resolve it, respond with { "patch_type": null, "rationale": "<why>" }.
`;

export const HISTORY_BLOCK_HEADER = `\

Previous attempts in this repair loop (most recent last). Each entry shows the
patch you proposed and the verifier's verdict. AVOID repeating patches that
were UNRESOLVED or caused REGRESSION.
`;

export function renderHistory(history) {
  if (!history?.length) return "";
  const items = history
    .map((h, i) => {
      const v = h.verify
        ? `status=${h.verify.status} targetResolved=${h.verify.targetResolved} newFailures=${h.verify.newFailureCount} ssim=${h.verify.similarity?.toFixed(3) ?? "n/a"}`
        : `error: ${h.error ?? "n/a"}`;
      return `--- attempt ${i + 1} ---\npatch: ${JSON.stringify(h.patch)}\nverdict: ${v}`;
    })
    .join("\n");
  return `${HISTORY_BLOCK_HEADER}\n${items}\n`;
}

export function renderEvidence(bundle) {
  const lines = [];
  lines.push(`EVIDENCE LEVEL: ${bundle.level}`);
  lines.push(`SUCCESS CRITERION: ${bundle.sc}`);
  if (bundle.element) {
    lines.push(`\nELEMENT:`);
    lines.push(`  selector: ${bundle.element.selector}`);
    if (bundle.element.tagName) lines.push(`  tag: ${bundle.element.tagName}`);
    if (bundle.element.bbox) {
      lines.push(`  bbox: ${JSON.stringify(bundle.element.bbox)}`);
    }
    if (bundle.element.outerHTML) {
      lines.push(`  outerHTML: ${truncate(bundle.element.outerHTML, 600)}`);
    }
  }
  if (bundle.screenshot?.fullPagePath) {
    lines.push(`\nSCREENSHOT (full page, baseline): ${bundle.screenshot.fullPagePath}`);
  }
  if (bundle.screenshot?.annotatedCropBase64) {
    lines.push(
      `\nANNOTATED ELEMENT CROP (base64 PNG, ${bundle.screenshot.annotatedCropBase64.length} chars): see attached image.`,
    );
  }
  if (bundle.wcagTechniques) {
    lines.push(`\nWCAG TECHNIQUES:\n${bundle.wcagTechniques}`);
  }
  if (bundle.runtimeSlice) {
    lines.push(`\nRUNTIME EVIDENCE:`);
    lines.push(JSON.stringify(bundle.runtimeSlice, null, 2));
  }
  return lines.join("\n");
}

function truncate(s, n) {
  if (!s) return "";
  return s.length <= n ? s : s.slice(0, n) + "…";
}
