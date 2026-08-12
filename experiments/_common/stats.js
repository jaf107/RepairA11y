/**
 * Statistical helpers for RQ2 evidence ablation.
 *
 * - McNemar's test for paired binary outcomes (E_low vs E_high on the same
 *   case set). Reports continuity-corrected χ² and a 1-DOF chi-square p-value.
 * - Cohen's h for effect size between two proportions.
 *
 * Pure JS; no external stats library required.
 */

/**
 * Paired binary outcomes — `a[i]` and `b[i]` must refer to the same case.
 * Returns { b, c, chi2, p, significant, n }.
 *   b = a:success ∧ b:fail (cases lost going from a→b)
 *   c = a:fail    ∧ b:success (cases gained going from a→b)
 * McNemar χ² (with continuity correction) = (|b-c|-1)² / (b+c)
 */
export function mcNemar(a, b) {
  if (a.length !== b.length) {
    throw new Error("mcNemar: arrays must be same length");
  }
  let bb = 0, cc = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] && !b[i]) bb++;
    if (!a[i] && b[i]) cc++;
  }
  const denom = bb + cc;
  if (denom === 0) {
    return { b: bb, c: cc, chi2: 0, p: 1, significant: false, n: a.length };
  }
  const chi2 = Math.pow(Math.abs(bb - cc) - 1, 2) / denom;
  const p = chiSquareSurvival(chi2, 1);
  return { b: bb, c: cc, chi2, p, significant: p < 0.05, n: a.length };
}

/**
 * Cohen's h — effect size between two proportions.
 *   h = 2 · (arcsin(√p1) − arcsin(√p2))
 *   |h| < 0.2 negligible, 0.2-0.5 small, 0.5-0.8 medium, ≥ 0.8 large.
 */
export function cohensH(p1, p2) {
  const phi = (p) => 2 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, p))));
  return Math.abs(phi(p1) - phi(p2));
}

/**
 * Wilson score interval for a binomial proportion — better small-n coverage
 * than the normal (Wald) interval, which is why it is preferred for the per-SC
 * ablation tables (n as low as 18 trials/level).
 *   z = 1.96 for a 95% two-sided interval.
 * Returns { lower, upper } clamped to [0, 1]. n = 0 → the full [0, 1] range.
 */
export function wilsonInterval(successes, n, z = 1.96) {
  if (n === 0) return { lower: 0, upper: 1 };
  const p = successes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const margin =
    (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return {
    lower: Math.max(0, center - margin),
    upper: Math.min(1, center + margin),
  };
}

export function mean(xs) {
  if (!xs.length) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function std(xs) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(v);
}

/**
 * Chi-square survival function for ν=1 — closed form via erfc(√(x/2)).
 * Sufficient precision for p > 1e-6.
 */
function chiSquareSurvival(x, dof) {
  if (dof !== 1) throw new Error("only ν=1 supported");
  return erfc(Math.sqrt(x / 2));
}

/**
 * Complementary error function — Abramowitz & Stegun 7.1.26 approximation.
 * Max error ≈ 1.5e-7.
 */
function erfc(x) {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t -
      0.284496736) *
      t +
      0.254829592) *
      t *
      Math.exp(-ax * ax);
  const erfX = sign * y;
  return 1 - erfX;
}
