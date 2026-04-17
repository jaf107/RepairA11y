# Research Questions — RepairA11y

Five RQs derived from issues #14, #18, #19, #20, #21.

## RQ1 — Effectiveness (issue #18)

**Question:** How effective are rule-based and LLM-based generators at resolving WCAG 2.4 focus-behavior violations across controlled (D_d) and production (D_r) datasets?

**Design:** Full repair loop on D_d (22 pages) + D_r (27 sites), both generators, all 5 SCs.

**Metric:** Per-SC resolution rate, per-dataset totals. Expect D_r harder.

**Output:** `experiments/results/rq1.json` + markdown table.

---

## RQ2 — Runtime evidence ablation (issue #14) — CORE CLAIM

**Question:** Do LLM repair systems receiving runtime evidence (E3/E4) produce better patches than systems receiving only static evidence (E1/E2)?

**Design:** D_d × LLM generator × {E1, E2, E3, E4} × 3 seeds. Same model, pinned temperature.

**Evidence levels:**
- E1: outerHTML + full-page screenshot
- E2: E1 + WCAG technique text
- E3: E2 + runtime slice (style snapshots, contrast, obscurer, tab sequence)
- E4: E3 + annotated element-crop screenshot

**Metric:** Mean resolution rate ± std per level, per SC.

**Output:** `experiments/results/rq2.json` + paper-ready table.

---

## RQ3 — Loop iteration impact (issue #19)

**Question:** Does iterative re-prompting improve resolution, or is single-shot enough?

**Design:** D_r × LLM generator × E3 × maxIterations ∈ {1, 3, 5}.

**Metric:** Marginal resolution gain per added iteration. Diminishing-returns curve (or absence).

**Output:** Iteration-vs-resolution plot.

---

## RQ4 — Regression detection (issue #20)

**Question:** Do successful repairs introduce new WCAG violations or visual breakage?

**Design:** Reuse RQ1 patches. SSIM threshold sweep {0.90, 0.95, 0.98} + new-violation counts.

**Metric:** Regression rate per generator. Claim-ready: "X% of patches introduce no new violations AND SSIM > 0.95."

**Output:** Per-generator regression table.

---

## RQ5 — Developer utility study (issue #21)

**Question:** Do human developers accept generated patches as correct, minimal, and well-rationalized?

**Design:** 20 patches sampled across SCs + generators. N≈20 devs rate Accept / Accept-with-edits / Reject.

**Rubric:** correctness · minimality · rationale clarity.

**Metric:** Inter-rater agreement (Cohen's κ or Fleiss' κ). Pass rate vs manual-accept rate side-by-side.

**Output:** `experiments/results/rq5.json`. Addresses oracle-overfit threat.

---

## Dependency map

```
RQ1 ──┬── needs all 5 SC generators (rule + LLM)
      └── feeds RQ4 (regression reuses patches)

RQ2 ── only SC 2.4.13 LLM — earliest paper-able result
       CORE CLAIM of thesis chapter 2

RQ3 ── after RQ1 infra in place, LLM only

RQ4 ── reuses RQ1 artifacts

RQ5 ── last, needs finished patches across RQs
```

## Positioning per RQ

| RQ | Competitor baseline | Claim |
|----|---------------------|-------|
| RQ1 | GenA11y (0% recall on 2.4.3/2.4.7), AccessGuru (axe-only) | First tool covering focus-behavior SCs end-to-end |
| RQ2 | Static-evidence LLM repair (E1/E2 ≈ GenA11y, DesignRepair) | Runtime evidence = better patches |
| RQ3 | AccessGuru loop structure | Iterations do real work (or don't) |
| RQ4 | Prior work reports resolution only, rarely regression | Minimal side-effect claim |
| RQ5 | Oracle-only pass rates (everyone else) | Human-validated accept rate |
