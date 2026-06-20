# RepairA11y — Experiment Results Summary

_Generated: 2026-06-20T18:49:20.422Z_

---

## RQ1 — Repair Effectiveness (D_d Controlled Dataset)

**Source:** run-2026-06-20T18-47-44-021Z.json

| Generator | Resolved | Total | Rate |
|---|---|---|---|
| rule_based | 6 | 10 | 60.0% |
| llm_based | 21 | 30 | 70.0% |

| SC | Resolved | Total | Rate |
|---|---|---|---|
| 2.4.11 | 5 | 8 | 62.5% |
| 2.4.12 | 5 | 8 | 62.5% |
| 2.4.13 | 17 | 24 | 70.8% |

---
## RQ2 — Evidence Ablation (SC 2.4.13)

_No RQ2 results found._

---
## RQ4 — Regression Analysis

# RQ4 — Regression Analysis
- generated: 2026-06-20T18:27:43.050Z

## Summary
- Cases evaluated: **8**
- Patches that introduced ≥1 new failure: **0** (0.0%)
- Mean SSIM (visual stability): **1.000**
- Mean selector specificity (invasiveness proxy): **4.0**

## Per-SC regression rate
| SC | Cases | Regressed | Rate |
|---|---|---|---|
| 2.4.11 | 2 | 0 | 0.0% |
| 2.4.12 | 2 | 0 | 0.0% |
| 2.4.13 | 4 | 0 | 0.0% |

---
## D_r — Production Site Violation Counts

_D_r scan not yet complete._

---
## Key Observations

1. **Rule-based** resolves 60% of D_d FAIL cases (6/10)
2. **LLM-based** resolves 70% of D_d FAIL cases (21/30)
3. **Regression rate**: 0.0% — patches safe (SSIM 1.000)