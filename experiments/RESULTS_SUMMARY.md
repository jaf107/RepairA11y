# RepairA11y — Experiment Results Summary

_Generated: 2026-06-21T06:11:17.628Z_

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

# RQ2 — Evidence Ablation (SC 2.4.13)

- runs: **1**, seeds: **1**, dry: **true**
- generated: 2026-06-21T06:07:22.468Z

## Per-level resolution rate (mean ± std across runs)
| Level | Mean | Std | Cases (n_trials) |
|---|---|---|---|
| E1 | 14.3% | ±0.0% | 7 |
| E2 | 14.3% | ±0.0% | 7 |
| E3 | 14.3% | ±0.0% | 7 |
| E4 | 14.3% | ±0.0% | 7 |

## McNemar paired tests
| Comparison | mean A | mean B | b (A→B loss) | c (A→B gain) | χ² | p | Cohen's h | sig? |
|---|---|---|---|---|---|---|---|---|
| E1_vs_E2 | 14.3% | 14.3% | 0 | 0 | 0.000 | 1.0000 | 0.000 |  |
| E1_vs_E3 | 14.3% | 14.3% | 0 | 0 | 0.000 | 1.0000 | 0.000 |  |
| E1_vs_E4 | 14.3% | 14.3% | 0 | 0 | 0.000 | 1.0000 | 0.000 |  |
| E2_vs_E3 | 14.3% | 14.3% | 0 | 0 | 0.000 | 1.0000 | 0.000 |  |
| E3_vs_E4 | 14.3% | 14.3% | 0 | 0 | 0.000 | 1.0000 | 0.000 |  |

## Overall aggregate
# Experiment report — RQ2

## Summary
- **Cases**: 28
- **Resolution rate**: 14.3% (4/28)
- **Regression rate**: 0.0%
- **Mean iterations**: 1.00
- **Mean SSIM**: 1.000

## By status
| Status | Count |
|---|---|
| RESOLVED | 4 |
| UNRESOLVED | 24 |
| REGRESSED | 0 |
| DECLINED | 0 |
| ERROR | 0 |

## By evidence level
| Level | Resolved | Total | Rate |
|---|---|---|---|
| E1 | 1 | 7 | 14.3% |
| E2 | 1 | 7 | 14.3% |
| E3 | 1 | 7 | 14.3% |
| E4 | 1 | 7 | 14.3% |


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
4. **Evidence ablation**: E1 (static) 14.3% vs E3 (runtime) 14.3% resolution rate
   McNemar E1 vs E3: p=1.0000, Cohen's h=0.000, not significant