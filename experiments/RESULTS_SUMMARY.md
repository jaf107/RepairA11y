# RepairA11y — Experiment Results Summary

_Generated: 2026-08-13T14:33:51.791Z_

---

## RQ1 — Repair Effectiveness

**Source:** run-2026-08-13T07-30-32-834Z.json


### D_d
| Generator | Resolved | Total | Rate |
|---|---|---|---|
| llm_based | 30 | 30 | 100.0% |

| SC | Resolved | Total | Rate |
|---|---|---|---|
| 2.4.11 | 6 | 6 | 100.0% |
| 2.4.12 | 6 | 6 | 100.0% |
| 2.4.13 | 18 | 18 | 100.0% |

### D_new
| Generator | Resolved | Total | Rate |
|---|---|---|---|
| llm_based | 45 | 66 | 68.2% |

| SC | Resolved | Total | Rate |
|---|---|---|---|
| 2.4.11 | 9 | 18 | 50.0% |
| 2.4.12 | 15 | 27 | 55.6% |
| 2.4.13 | 21 | 21 | 100.0% |

---
## RQ2 — Evidence Ablation (SC 2.4.13)

### D_d (controlled fixtures)

# RQ2 — Evidence Ablation (SC 2.4.13)

- runs: **3**, seeds: **1,2,3**, dry: **false**
- generated: 2026-08-13T12:04:58.018Z

## Per-level resolution rate (mean ± std across runs)
| Level | Mean | Std | Wilson 95% CI | Cases (n_trials) |
|---|---|---|---|---|
| E1 | 100.0% | ±0.0% | [93.4%, 100.0%] | 54 |
| E2 | 100.0% | ±0.0% | [93.4%, 100.0%] | 54 |
| E3 | 100.0% | ±0.0% | [93.4%, 100.0%] | 54 |
| E4 | 100.0% | ±0.0% | [93.4%, 100.0%] | 54 |

## McNemar paired tests
| Comparison | mean A | mean B | b (A→B loss) | c (A→B gain) | χ² | p | Cohen's h | sig? |
|---|---|---|---|---|---|---|---|---|
| E1_vs_E2 | 100.0% | 100.0% | 0 | 0 | 0.000 | 1.0000 | 0.000 |  |
| E1_vs_E3 | 100.0% | 100.0% | 0 | 0 | 0.000 | 1.0000 | 0.000 |  |
| E1_vs_E4 | 100.0% | 100.0% | 0 | 0 | 0.000 | 1.0000 | 0.000 |  |
| E2_vs_E3 | 100.0% | 100.0% | 0 | 0 | 0.000 | 1.0000 | 0.000 |  |
| E3_vs_E4 | 100.0% | 100.0% | 0 | 0 | 0.000 | 1.0000 | 0.000 |  |

## Overall aggregate
# Experiment report — RQ2

## Summary
- **Cases**: 216
- **Resolution rate**: 100.0% (216/216)
- **Regression rate**: 0.0%
- **Mean iterations**: 1.00
- **Mean SSIM**: 1.000

## By status
| Status | Count |
|---|---|
| RESOLVED | 216 |
| UNRESOLVED | 0 |
| REGRESSED | 0 |
| DECLINED | 0 |
| ERROR | 0 |

## By evidence level
| Level | Resolved | Total | Rate |
|---|---|---|---|
| E1 | 54 | 54 | 100.0% |
| E2 | 54 | 54 | 100.0% |
| E3 | 54 | 54 | 100.0% |
| E4 | 54 | 54 | 100.0% |


### D_new (realistic corpus)

# RQ2 — Evidence Ablation (SC 2.4.13)

- runs: **1**, seeds: **1,2,3**, dry: **false**
- generated: 2026-08-13T14:29:24.413Z

## Per-level resolution rate (mean ± std across runs)
| Level | Mean | Std | Wilson 95% CI | Cases (n_trials) |
|---|---|---|---|---|
| E1 | 71.4% | ±0.0% | [50.0%, 86.2%] | 21 |
| E2 | 42.9% | ±0.0% | [24.5%, 63.5%] | 21 |
| E3 | 100.0% | ±0.0% | [84.5%, 100.0%] | 21 |
| E4 | 100.0% | ±0.0% | [84.5%, 100.0%] | 21 |

## McNemar paired tests
| Comparison | mean A | mean B | b (A→B loss) | c (A→B gain) | χ² | p | Cohen's h | sig? |
|---|---|---|---|---|---|---|---|---|
| E1_vs_E2 | 71.4% | 42.9% | 6 | 0 | 4.167 | 0.0412 | 0.586 | ✓ |
| E1_vs_E3 | 71.4% | 100.0% | 0 | 6 | 4.167 | 0.0412 | 1.128 | ✓ |
| E1_vs_E4 | 71.4% | 100.0% | 0 | 6 | 4.167 | 0.0412 | 1.128 | ✓ |
| E2_vs_E3 | 42.9% | 100.0% | 0 | 12 | 10.083 | 0.0015 | 1.714 | ✓ |
| E3_vs_E4 | 100.0% | 100.0% | 0 | 0 | 0.000 | 1.0000 | 0.000 |  |

## Overall aggregate
# Experiment report — RQ2

## Summary
- **Cases**: 84
- **Resolution rate**: 78.6% (66/84)
- **Regression rate**: 0.0%
- **Mean iterations**: 1.00
- **Mean SSIM**: 1.000

## By status
| Status | Count |
|---|---|
| RESOLVED | 66 |
| UNRESOLVED | 15 |
| REGRESSED | 0 |
| DECLINED | 3 |
| ERROR | 0 |

## By evidence level
| Level | Resolved | Total | Rate |
|---|---|---|---|
| E1 | 15 | 21 | 71.4% |
| E2 | 9 | 21 | 42.9% |
| E3 | 21 | 21 | 100.0% |
| E4 | 21 | 21 | 100.0% |


---
## RQ2 — Evidence Ablation (SC 2.4.11)

# RQ2 — Evidence Ablation (SC 2.4.11)

- runs: **1**, seeds: **1,2,3**, dry: **false**
- generated: 2026-08-12T16:50:52.920Z

## Per-level resolution rate (mean ± std across runs)
| Level | Mean | Std | Wilson 95% CI | Cases (n_trials) |
|---|---|---|---|---|
| E1 | 66.7% | ±0.0% | [43.7%, 83.7%] | 18 |
| E2 | 66.7% | ±0.0% | [43.7%, 83.7%] | 18 |
| E3 | 50.0% | ±0.0% | [29.0%, 71.0%] | 18 |
| E4 | 50.0% | ±0.0% | [29.0%, 71.0%] | 18 |

## McNemar paired tests
| Comparison | mean A | mean B | b (A→B loss) | c (A→B gain) | χ² | p | Cohen's h | sig? |
|---|---|---|---|---|---|---|---|---|
| E1_vs_E2 | 66.7% | 66.7% | 0 | 0 | 0.000 | 1.0000 | 0.000 |  |
| E1_vs_E3 | 66.7% | 50.0% | 3 | 0 | 1.333 | 0.2482 | 0.340 |  |
| E1_vs_E4 | 66.7% | 50.0% | 3 | 0 | 1.333 | 0.2482 | 0.340 |  |
| E2_vs_E3 | 66.7% | 50.0% | 3 | 0 | 1.333 | 0.2482 | 0.340 |  |
| E3_vs_E4 | 50.0% | 50.0% | 0 | 0 | 0.000 | 1.0000 | 0.000 |  |

## Overall aggregate
# Experiment report — RQ2

## Summary
- **Cases**: 72
- **Resolution rate**: 58.3% (42/72)
- **Regression rate**: 0.0%
- **Mean iterations**: 1.00
- **Mean SSIM**: 1.000

## By status
| Status | Count |
|---|---|
| RESOLVED | 42 |
| UNRESOLVED | 30 |
| REGRESSED | 0 |
| DECLINED | 0 |
| ERROR | 0 |

## By evidence level
| Level | Resolved | Total | Rate |
|---|---|---|---|
| E1 | 12 | 18 | 66.7% |
| E2 | 12 | 18 | 66.7% |
| E3 | 9 | 18 | 50.0% |
| E4 | 9 | 18 | 50.0% |


---
## RQ2 — Evidence Ablation (SC 2.4.12)

# RQ2 — Evidence Ablation (SC 2.4.12)

- runs: **1**, seeds: **1,2,3**, dry: **false**
- generated: 2026-08-12T18:33:43.763Z

## Per-level resolution rate (mean ± std across runs)
| Level | Mean | Std | Wilson 95% CI | Cases (n_trials) |
|---|---|---|---|---|
| E1 | 77.8% | ±0.0% | [59.2%, 89.4%] | 27 |
| E2 | 77.8% | ±0.0% | [59.2%, 89.4%] | 27 |
| E3 | 55.6% | ±0.0% | [37.3%, 72.4%] | 27 |
| E4 | 55.6% | ±0.0% | [37.3%, 72.4%] | 27 |

## McNemar paired tests
| Comparison | mean A | mean B | b (A→B loss) | c (A→B gain) | χ² | p | Cohen's h | sig? |
|---|---|---|---|---|---|---|---|---|
| E1_vs_E2 | 77.8% | 77.8% | 0 | 0 | 0.000 | 1.0000 | 0.000 |  |
| E1_vs_E3 | 77.8% | 55.6% | 6 | 0 | 4.167 | 0.0412 | 0.478 | ✓ |
| E1_vs_E4 | 77.8% | 55.6% | 6 | 0 | 4.167 | 0.0412 | 0.478 | ✓ |
| E2_vs_E3 | 77.8% | 55.6% | 6 | 0 | 4.167 | 0.0412 | 0.478 | ✓ |
| E3_vs_E4 | 55.6% | 55.6% | 0 | 0 | 0.000 | 1.0000 | 0.000 |  |

## Overall aggregate
# Experiment report — RQ2

## Summary
- **Cases**: 108
- **Resolution rate**: 66.7% (72/108)
- **Regression rate**: 0.0%
- **Mean iterations**: 1.00
- **Mean SSIM**: 1.000

## By status
| Status | Count |
|---|---|
| RESOLVED | 72 |
| UNRESOLVED | 36 |
| REGRESSED | 0 |
| DECLINED | 0 |
| ERROR | 0 |

## By evidence level
| Level | Resolved | Total | Rate |
|---|---|---|---|
| E1 | 21 | 27 | 77.8% |
| E2 | 21 | 27 | 77.8% |
| E3 | 15 | 27 | 55.6% |
| E4 | 15 | 27 | 55.6% |


---
## RQ2 — Evidence Ablation (SC 2.4.3)

# RQ2 — Evidence Ablation (SC 2.4.3)

- runs: **1**, seeds: **1,2,3**, dry: **false**
- generated: 2026-08-13T05:48:48.847Z

## Per-level resolution rate (mean ± std across runs)
| Level | Mean | Std | Wilson 95% CI | Cases (n_trials) |
|---|---|---|---|---|
| E1 | 0.0% | ±0.0% | [0.0%, 56.2%] | 3 |
| E2 | 0.0% | ±0.0% | [0.0%, 56.2%] | 3 |
| E3 | 100.0% | ±0.0% | [43.8%, 100.0%] | 3 |
| E4 | 100.0% | ±0.0% | [43.8%, 100.0%] | 3 |

## McNemar paired tests
| Comparison | mean A | mean B | b (A→B loss) | c (A→B gain) | χ² | p | Cohen's h | sig? |
|---|---|---|---|---|---|---|---|---|
| E1_vs_E2 | 0.0% | 0.0% | 0 | 0 | 0.000 | 1.0000 | 0.000 |  |
| E1_vs_E3 | 0.0% | 100.0% | 0 | 3 | 1.333 | 0.2482 | 3.142 |  |
| E1_vs_E4 | 0.0% | 100.0% | 0 | 3 | 1.333 | 0.2482 | 3.142 |  |
| E2_vs_E3 | 0.0% | 100.0% | 0 | 3 | 1.333 | 0.2482 | 3.142 |  |
| E3_vs_E4 | 100.0% | 100.0% | 0 | 0 | 0.000 | 1.0000 | 0.000 |  |

## Overall aggregate
# Experiment report — RQ2

## Summary
- **Cases**: 12
- **Resolution rate**: 50.0% (6/12)
- **Regression rate**: 0.0%
- **Mean iterations**: 1.00
- **Mean SSIM**: 1.000

## By status
| Status | Count |
|---|---|
| RESOLVED | 6 |
| UNRESOLVED | 6 |
| REGRESSED | 0 |
| DECLINED | 0 |
| ERROR | 0 |

## By evidence level
| Level | Resolved | Total | Rate |
|---|---|---|---|
| E1 | 0 | 3 | 0.0% |
| E2 | 0 | 3 | 0.0% |
| E3 | 3 | 3 | 100.0% |
| E4 | 3 | 3 | 100.0% |


---
## RQ4 — Regression Analysis

# RQ4 — Regression Analysis
- generated: 2026-08-13T14:32:21.806Z

## Summary
- Cases evaluated: **10**
- Patches that introduced ≥1 new failure: **0** (0.0%)
- Mean SSIM (visual stability): **0.997**
- Mean selector specificity (invasiveness proxy): **4.0**

## Per-SC regression rate
| SC | Cases | Regressed | Rate |
|---|---|---|---|
| 2.4.11 | 2 | 0 | 0.0% |
| 2.4.12 | 2 | 0 | 0.0% |
| 2.4.13 | 6 | 0 | 0.0% |

---
## D_r — Production Site Violation Counts

**Source:** scan-2026-06-20T19-04-14-033Z.json
- Sites scanned: 27 (26 succeeded, 1 errors)

| SC | Sites affected | Total violations | Mean/site |
|---|---|---|---|
| 2.4.11 | 14 | 283 | 10.88 |
| 2.4.12 | 21 | 497 | 19.12 |
| 2.4.13 | 25 | 1841 | 70.81 |
| 2.4.7 | 18 | 270 | 10.38 |

**Per-site breakdown:**

| Site | Total FAILs | 2.4.7 | 2.4.11 | 2.4.12 | 2.4.13 |
|---|---|---|---|---|---|
| https://www.adp.com | 105 | 6 | 7 | 16 | 75 |
| https://www.agoda.com | 100 | 3 | 23 | 56 | 18 |
| https://www.caliente.mx | 75 | 16 | 0 | 1 | 58 |
| https://www.capitalone.com | 84 | 8 | 1 | 1 | 74 |
| https://www.cricbuzz.com | ERROR | — | — | — | — |
| https://www.discord.com | 27 | 1 | 0 | 1 | 25 |
| https://www.doubleclick.net | 18 | 0 | 0 | 5 | 13 |
| https://www.ebay.com | 104 | 1 | 0 | 3 | 99 |
| https://www.fragrantica.com | 461 | 0 | 1 | 96 | 364 |
| https://www.genius.com | 253 | 42 | 35 | 35 | 140 |
| https://www.google.com | 23 | 2 | 0 | 1 | 20 |
| https://www.live.com | 99 | 2 | 2 | 8 | 86 |
| https://www.nih.gov | 3 | 0 | 0 | 0 | 2 |
| https://www.openai.com | 96 | 19 | 0 | 1 | 76 |
| https://www.progressive.com | 3 | 1 | 0 | 0 | 2 |
| https://www.qualtrics.com | 65 | 4 | 10 | 14 | 37 |
| https://www.samsung.com | 19 | 0 | 0 | 1 | 18 |
| https://www.sciencedirect.com | 1 | 0 | 0 | 0 | 0 |
| https://www.shein.com | 554 | 119 | 145 | 171 | 119 |
| https://www.stackoverflow.com | 145 | 0 | 6 | 17 | 122 |
| https://www.steamcommunity.com | 201 | 3 | 5 | 8 | 185 |
| https://www.usps.com | 59 | 17 | 3 | 4 | 35 |
| https://www.walmart.com | 75 | 1 | 28 | 28 | 17 |
| https://www.yahoo.com | 193 | 17 | 15 | 23 | 137 |
| https://www.youtube.com | 29 | 8 | 2 | 7 | 12 |
| https://www.zerodha.com | 78 | 0 | 0 | 0 | 78 |
| https://www.wikipedia.org | 29 | 0 | 0 | 0 | 29 |

---
## Key Observations

1. **LLM-based (D_d)** resolves 100.0% (30/30)
2. **LLM-based (D_new)** resolves 68.2% (45/66)
- **Regression rate**: 0.0% — patches safe (SSIM 0.997)
- **Evidence ablation (D_d)**: E1 (static) 100.0% → E3 (runtime) 100.0% (+0.0pp)
  McNemar: χ²=0.000, p=1.0000, Cohen's h=0.000, not significant
- **Evidence ablation (D_new)**: E1 (static) 71.4% → E3 (runtime) 100.0% (+28.6pp)
  McNemar: χ²=4.167, p=0.0412, Cohen's h=1.128, **significant**