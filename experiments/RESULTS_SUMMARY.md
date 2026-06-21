# RepairA11y — Experiment Results Summary

_Generated: 2026-06-21T07:03:35.151Z_

---

## RQ1 — Repair Effectiveness

**Source:** run-2026-06-21T06-10-45-808Z.json


### D_d
| Generator | Resolved | Total | Rate |
|---|---|---|---|
| rule_based | 6 | 6 | 100.0% |
| llm_based | 17 | 18 | 94.4% |

| SC | Resolved | Total | Rate |
|---|---|---|---|
| 2.4.13 | 23 | 24 | 95.8% |

### D_new
| Generator | Resolved | Total | Rate |
|---|---|---|---|
| rule_based | 7 | 7 | 100.0% |
| llm_based | 16 | 21 | 76.2% |

| SC | Resolved | Total | Rate |
|---|---|---|---|
| 2.4.13 | 23 | 28 | 82.1% |

---
## RQ2 — Evidence Ablation (SC 2.4.13)

### D_d (controlled fixtures)

# RQ2 — Evidence Ablation (SC 2.4.13)

- runs: **3**, seeds: **1,2,3**, dry: **false**
- generated: 2026-06-21T06:19:00.931Z

## Per-level resolution rate (mean ± std across runs)
| Level | Mean | Std | Cases (n_trials) |
|---|---|---|---|
| E1 | 66.7% | ±0.0% | 54 |
| E2 | 53.7% | ±11.1% | 54 |
| E3 | 92.6% | ±8.8% | 54 |
| E4 | 88.9% | ±11.8% | 54 |

## McNemar paired tests
| Comparison | mean A | mean B | b (A→B loss) | c (A→B gain) | χ² | p | Cohen's h | sig? |
|---|---|---|---|---|---|---|---|---|
| E1_vs_E2 | 66.7% | 53.7% | 7 | 0 | 5.143 | 0.0233 | 0.266 | ✓ |
| E1_vs_E3 | 66.7% | 92.6% | 2 | 16 | 9.389 | 0.0022 | 0.680 | ✓ |
| E1_vs_E4 | 66.7% | 88.9% | 2 | 14 | 7.563 | 0.0060 | 0.551 | ✓ |
| E2_vs_E3 | 53.7% | 92.6% | 2 | 23 | 16.000 | 0.0001 | 0.945 | ✓ |
| E3_vs_E4 | 92.6% | 88.9% | 5 | 3 | 0.125 | 0.7237 | 0.128 |  |

## Overall aggregate
# Experiment report — RQ2

## Summary
- **Cases**: 216
- **Resolution rate**: 75.5% (163/216)
- **Regression rate**: 0.0%
- **Mean iterations**: 1.00
- **Mean SSIM**: 1.000

## By status
| Status | Count |
|---|---|
| RESOLVED | 163 |
| UNRESOLVED | 36 |
| REGRESSED | 0 |
| DECLINED | 0 |
| ERROR | 17 |

## By evidence level
| Level | Resolved | Total | Rate |
|---|---|---|---|
| E1 | 36 | 54 | 66.7% |
| E2 | 29 | 54 | 53.7% |
| E3 | 50 | 54 | 92.6% |
| E4 | 48 | 54 | 88.9% |


### D_new (realistic corpus)

# RQ2 — Evidence Ablation (SC 2.4.13)

- runs: **1**, seeds: **1,2,3**, dry: **false**
- generated: 2026-06-21T07:03:24.329Z

## Per-level resolution rate (mean ± std across runs)
| Level | Mean | Std | Cases (n_trials) |
|---|---|---|---|
| E1 | 33.3% | ±8.2% | 21 |
| E2 | 42.9% | ±0.0% | 21 |
| E3 | 81.0% | ±8.2% | 21 |
| E4 | 85.7% | ±14.3% | 21 |

## McNemar paired tests
| Comparison | mean A | mean B | b (A→B loss) | c (A→B gain) | χ² | p | Cohen's h | sig? |
|---|---|---|---|---|---|---|---|---|
| E1_vs_E2 | 33.3% | 42.9% | 0 | 2 | 0.500 | 0.4795 | 0.196 |  |
| E1_vs_E3 | 33.3% | 81.0% | 0 | 10 | 8.100 | 0.0044 | 1.007 | ✓ |
| E1_vs_E4 | 33.3% | 85.7% | 0 | 11 | 9.091 | 0.0026 | 1.135 | ✓ |
| E2_vs_E3 | 42.9% | 81.0% | 0 | 8 | 6.125 | 0.0133 | 0.811 | ✓ |
| E3_vs_E4 | 81.0% | 85.7% | 1 | 2 | 0.000 | 1.0000 | 0.128 |  |

## Overall aggregate
# Experiment report — RQ2

## Summary
- **Cases**: 84
- **Resolution rate**: 60.7% (51/84)
- **Regression rate**: 0.0%
- **Mean iterations**: 1.00
- **Mean SSIM**: 1.000

## By status
| Status | Count |
|---|---|
| RESOLVED | 51 |
| UNRESOLVED | 28 |
| REGRESSED | 0 |
| DECLINED | 0 |
| ERROR | 5 |

## By evidence level
| Level | Resolved | Total | Rate |
|---|---|---|---|
| E1 | 7 | 21 | 33.3% |
| E2 | 9 | 21 | 42.9% |
| E3 | 17 | 21 | 81.0% |
| E4 | 18 | 21 | 85.7% |


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

1. **Rule-based (D_d)** resolves 100.0% (6/6)
2. **LLM-based (D_d)** resolves 94.4% (17/18)
3. **Rule-based (D_new)** resolves 100.0% (7/7)
4. **LLM-based (D_new)** resolves 76.2% (16/21)
- **Regression rate**: 0.0% — patches safe (SSIM 1.000)
- **Evidence ablation (D_d)**: E1 (static) 66.7% → E3 (runtime) 92.6% (+25.9pp)
  McNemar: χ²=9.389, p=0.0022, Cohen's h=0.680, **significant**
- **Evidence ablation (D_new)**: E1 (static) 33.3% → E3 (runtime) 81.0% (+47.6pp)
  McNemar: χ²=8.100, p=0.0044, Cohen's h=1.007, **significant**