/**
 * WCAG 2.4.11 Focus Not Obscured (Minimum) (Level AA)
 *
 * Requirement: When a user interface component receives keyboard focus, the component
 * is not entirely hidden due to author-created content.
 *
 * Reference: https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html
 */

export function checkFocusNotObscuredMinimum(trace, config = {}) {
  const { element, obscuration } = trace;

  if (!obscuration) {
    return {
      result: 'REVIEW',
      reason: 'Missing obscuration data',
      evidence: {},
      sc: '2.4.11'
    };
  }

  if (obscuration.isFullyObscured) {
    return {
      result: 'FAIL',
      reason: `Focused element is entirely hidden by other content (obscured by: ${(obscuration.obscuredBy || []).join(', ')})`,
      evidence: {
        obscuredRatio: obscuration.obscuredRatio,
        obscuredBy: obscuration.obscuredBy,
        obscurers: obscuration.obscurers || []
      },
      sc: '2.4.11'
    };
  }

  if (obscuration.isPartiallyObscured) {
    return {
      result: 'PASS',
      reason: `Focused element is partially obscured but still visible (${(obscuration.obscuredRatio * 100).toFixed(1)}% hidden)`,
      evidence: {
        obscuredRatio: obscuration.obscuredRatio,
        obscuredBy: obscuration.obscuredBy,
        obscurers: obscuration.obscurers || []
      },
      sc: '2.4.11'
    };
  }

  return {
    result: 'PASS',
    reason: 'Focused element is fully visible (not obscured)',
    evidence: {
      obscuredRatio: 0
    },
    sc: '2.4.11'
  };
}
