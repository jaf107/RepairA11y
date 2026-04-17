/**
 * WCAG 2.4.12 Focus Not Obscured (Enhanced) (Level AAA)
 *
 * Requirement: When a user interface component receives keyboard focus, no part of the
 * component is hidden by author-created content.
 *
 * Reference: https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-enhanced.html
 */

export function checkFocusNotObscuredEnhanced(trace, config = {}) {
  const { element, obscuration } = trace;

  if (!obscuration) {
    return {
      result: 'REVIEW',
      reason: 'Missing obscuration data',
      evidence: {},
      sc: '2.4.12'
    };
  }

  // Enhanced requires 0 obscuration
  if (obscuration.isPartiallyObscured || obscuration.isFullyObscured) {
    return {
      result: 'FAIL',
      reason: `Focused element is obscured by other content (${(obscuration.obscuredRatio * 100).toFixed(1)}% hidden. Obscured by: ${(obscuration.obscuredBy || []).join(', ')})`,
      evidence: {
        obscuredRatio: obscuration.obscuredRatio,
        obscuredBy: obscuration.obscuredBy
      },
      sc: '2.4.12'
    };
  }

  return {
    result: 'PASS',
    reason: 'Focused element is fully visible (not obscured)',
    evidence: {
      obscuredRatio: 0
    },
    sc: '2.4.12'
  };
}
