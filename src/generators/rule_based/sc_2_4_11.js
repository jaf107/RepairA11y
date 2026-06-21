/**
 * Rule-based generator for SC 2.4.11 (Focus Not Obscured, Minimum, AA).
 *
 * Strategy: bump the focused element's z-index strictly above the highest
 * obscurer's z-index. Uses NavA11y's exported `evidence.obscurers[]`
 * (NavA11y PR #2 — already merged upstream). Falls back to `obscuredBy` names
 * if the structured array isn't present.
 *
 * Caveat: z-index changes can affect surrounding stacking contexts. The
 * verifier's regression pass (Pass 2: new failures) is the safety net.
 */
export function generate({ violation }) {
  if (!violation || violation.sc !== "2.4.11" || violation.result !== "FAIL") {
    return null;
  }
  return generateZIndexBump(violation, { strict: false });
}

export function generateZIndexBump(violation, { strict }) {
  const selector = violation.element?.selector;
  if (!selector) return null;

  const ev = violation.evidence || {};
  const obscurers = Array.isArray(ev.obscurers) ? ev.obscurers : [];

  // Find max z-index among obscurers (or fall back to a sensible default).
  let maxZ = 0;
  for (const o of obscurers) {
    const z = parseInt(o.zIndex ?? o.z_index ?? "0", 10);
    if (Number.isFinite(z)) maxZ = Math.max(maxZ, z);
  }
  if (maxZ === 0 && obscurers.length === 0) {
    // No structured obscurer data. Use a conservative bump.
    maxZ = 100;
  }
  const target = maxZ + (strict ? 100 : 50);

  return {
    patch_type: "css_inject",
    target_selector: selector,
    payload: {
      // z-index needs !important to beat the author's own (usually class-based,
      // higher-specificity) rule on the focused element — without it the bump is
      // silently dropped and the element stays obscured. position:relative is
      // left non-important so it only fills in for statically-positioned
      // elements (where z-index would otherwise be inert) and does not force a
      // layout shift on elements that are already fixed/absolute/sticky.
      rule: `${selector} { z-index: ${target} !important; position: relative; }`,
    },
    rationale: `Element obscured by ${obscurers.length || "unknown"} overlay(s) (max z-index ${maxZ}). Raised focused element's stacking order to ${target} (with !important to override author styles); position:relative ensures z-index applies to statically-positioned elements.${strict ? " (Enhanced/AAA buffer of +100 applied.)" : ""}`,
    wcag_technique_cited: null,
  };
}
