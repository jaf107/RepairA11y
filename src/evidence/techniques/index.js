/**
 * WCAG technique excerpts cited by RepairA11y generators.
 *
 * Why inline rather than fetched: WCAG techniques are stable; offline use
 * matters for reproducibility; the LLM only needs the operational summary,
 * not the full W3C page.
 *
 * Sources (Understanding WCAG 2.2):
 *   F44 — https://www.w3.org/WAI/WCAG22/Techniques/failures/F44
 *   F78 — https://www.w3.org/WAI/WCAG22/Techniques/failures/F78
 *   C15 — https://www.w3.org/WAI/WCAG22/Techniques/css/C15
 *   C27 — https://www.w3.org/WAI/WCAG22/Techniques/css/C27
 *   C40 — https://www.w3.org/WAI/WCAG22/Techniques/css/C40
 *   G1  — https://www.w3.org/WAI/WCAG22/Techniques/general/G1
 */
export const TECHNIQUES = {
  F44: {
    code: "F44",
    title: "Failure: tabindex value greater than zero",
    summary:
      "Using a positive tabindex (>0) inserts an element ahead of other tabbable elements in the focus sequence, breaking natural DOM order. Use tabindex=\"0\" instead.",
  },
  F78: {
    code: "F78",
    title: "Failure: styling element outlines/borders such that focus indicator is removed/rendered invisible",
    summary:
      "Setting outline:none or styling that suppresses the visible focus indicator without a contrasting replacement fails SC 2.4.7. Provide a visible :focus or :focus-visible indicator with sufficient contrast and area.",
  },
  C15: {
    code: "C15",
    title: "Using CSS to change presentation on focus",
    summary:
      "Apply a CSS rule like :focus { ... } (or :focus-visible) to change background, border, outline, or other visible property to indicate keyboard focus.",
  },
  C27: {
    code: "C27",
    title: "Making the DOM order match the visual order",
    summary:
      "Order elements in source so the natural tab order matches the visible layout. Avoid CSS techniques (float, absolute positioning, flex order) that decouple visual and DOM order.",
  },
  C40: {
    code: "C40",
    title: "Creating a two-color focus indicator with sufficient contrast",
    summary:
      "Use a two-color focus indicator (e.g. outline of one color plus inner ring of contrasting color) so that the focus indicator is distinguishable against any background.",
  },
  G1: {
    code: "G1",
    title: "Adding a link at the top of each page",
    summary:
      "Provide a 'skip to main content' link as the first focusable element so keyboard users can bypass navigation blocks.",
  },
};

const SC_TECHNIQUES = {
  "2.4.3": ["F44", "C27"],
  "2.4.7": ["F78", "C15"],
  "2.4.11": [],
  "2.4.12": [],
  "2.4.13": ["F78", "C15", "C40"],
};

export function techniquesFor(sc) {
  const codes = SC_TECHNIQUES[sc] || [];
  return codes.map((c) => TECHNIQUES[c]).filter(Boolean);
}

export function techniqueText(sc) {
  return techniquesFor(sc)
    .map((t) => `${t.code} — ${t.title}\n${t.summary}`)
    .join("\n\n");
}
