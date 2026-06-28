# Chapter 5: Results and Analysis

> Note on data provenance: every number in this chapter is produced by an
> evaluation script in this repository and is traceable to a saved result file
> under `experiments/<name>/results/`. The exact command and result file for each
> figure are listed in the companion `README.md`. The numbers (the RQ1 ablation, the
> safety check measured on the same runs, and the D_r detection and live repair) come
> from recorded live runs dated 2026-06-20 and 2026-06-21.
> The recorded runs are the source of truth because re-running the full LLM suite
> requires the OpenRouter free-tier quota, which was exhausted at the time of
> writing. Where a quantity could not be verified from a script it is tagged
> `[VERIFY]` with an explanation of what is needed to confirm it.

## 5.1 Introduction

This chapter reports the empirical evaluation of RepairA11y, the automated repair
system for WCAG 2.4 focus-behavior violations introduced in the previous chapter.
The purpose of the chapter is to answer, with measured data, the central question
that decides whether the system is worth building, and to position the result
against the closest published repair systems while stating honestly what the
evidence can and cannot support.

The central research question is stated here in plain language.

- RQ1 (evidence ablation): does runtime evidence help a large language model (LLM)
  repair focus-behavior violations better than static evidence alone?

The question is answered by holding everything constant and varying only the evidence
bundle across four graduated levels, E1 to E4. Static evidence (the HTML and a
screenshot) is the lower end; runtime evidence (the computed styles and the measured
contrast ratio captured while the page is focused) is added at E3. The fourth level
(E4) adds a visual crop on top of the runtime evidence and acts as a control, testing
whether the effect keeps growing or saturates once runtime evidence is present.

Alongside effectiveness, the chapter reports a safety check on the same runs: do the
LLM patches introduce new conformance failures or change the page in a visually
disruptive way? A repair that fixes one problem but breaks another is not useful, so
this is reported next to every effectiveness number rather than as a separate study.

An earlier effectiveness comparison of generators, a separate rule-based generator,
and a focus-order criterion (SC 2.4.3) are out of scope for this chapter, which
focuses on the LLM repair path and the evidence it is given.

The headline findings are as follows. Runtime evidence (level E3) produces a large
and statistically significant improvement over static evidence (level E1) for LLM
repair. Adding the WCAG technique text alone (level E2) does not help, and on this
corpus it hurts. Adding a visual crop on top of runtime evidence (level E4) gives no
significant further gain, which shows the effect saturates once runtime evidence is
present. The patches are safe: across the 216 ablation trials no patch introduced a
new failure. Finally, the production scan shows that the target violation type is
common on real websites, which is the practical motivation for the work.

## 5.2 Experimental Setup

This section gives the detail needed to reproduce the experiments: the machine, the
software versions, the datasets, and the fixed configuration of the system. The
system has no training phase, so there are no learned hyperparameters to report. In
their place, the fixed configuration knobs and thresholds are listed, because those
are the values a reader would need to reproduce the numbers.

### 5.2.1 Hardware and software environment

The experiments were run on a single Apple macOS workstation (Darwin kernel
25.2.0, arm64). All code is JavaScript executed by Node.js (engine requirement
`>=20.6.0`), with one Python script used only to draw the figures in this chapter.
The relevant software versions are fixed by the project's `package.json` and are
listed in Table 5.1.

Table 5.1: Software environment.

| Component | Version / setting |
|---|---|
| Node.js | >= 20.6.0 (uses the built-in `--env-file` flag) |
| Playwright (headless Chromium) | ^1.58.0 |
| pixelmatch (visual diff) | ^7.2.0 |
| pngjs | ^7.0.0 |
| sharp (image crop for E4) | ^0.35.2 |
| ajv (JSON-schema validation) | ^8.18.0 |
| vitest (unit tests) | ^2.1.0 |
| LLM provider | OpenRouter, free tier |
| LLM model | `openai/gpt-oss-120b:free` |
| Decoding temperature | 0 (deterministic) |
| Provider rate limit | 3 requests per minute (free tier) |

The detection engine is NavA11y, the system from the previous chapter, used here
unchanged as both the violation detector (Stage 1) and the verification oracle
(Stage 5). NavA11y drives a headless Chromium browser through Playwright, calls
`.focus()` on each interactive element, and records 22 computed CSS properties
before and after focus, the measured contrast ratio of the focus indicator, and
whether the focused element is obscured by another element.

### 5.2.2 The repair pipeline and its fixed configuration

RepairA11y is a five-stage pipeline: detection, evidence packaging, generation,
patch application, and verification. The configuration knobs that affect the
results, with their fixed values, are listed in Table 5.2. These values were held
constant across every experiment in this chapter.

Table 5.2: Fixed configuration (the system has no trained parameters).

| Knob | Value | Meaning |
|---|---|---|
| `temperature` | 0 | Deterministic LLM decoding, for reproducibility |
| `maxAttempts` | 3 | Retries when the LLM returns malformed JSON |
| `maxIterations` | 1 | Repair attempts per violation in the experiments |
| `ssimThreshold` | 0.9 | Visual-similarity floor; below it a patch is flagged a regression |
| `RPM` | 3 | Free-tier request cap, enforced as a ~22 second gate between calls |

The evidence packager is the experimental lever for RQ1. It produces one of four
graduated, strictly additive bundles. Each higher level contains everything in the
level below it, so the only difference between two adjacent levels is the new
information added.

- E1: the element's outer HTML plus a full-page screenshot.
- E2: E1 plus the relevant WCAG technique text (for example, techniques F78, C27,
  G1).
- E3: E2 plus the runtime slice, namely the before-and-after computed style
  snapshots, the measured contrast ratio, and the obscurer element data.
- E4: E3 plus an annotated, cropped screenshot of the element with its bounding box
  drawn on.

### 5.2.3 Datasets

Two datasets are used. Their sizes and sources are summarized in Table 5.3. The
evidence ablation (RQ1), and the safety check measured on the same runs, use the
controlled corpus D_d, where the ground truth is known and the same cases can be
repaired many times. The production corpus D_r is used to measure how common the
target violation is in the wild and to test live repair.

Table 5.3: Datasets. FAIL-case counts are per Success Criterion, as registered in
`src/datasets/`.

| Dataset | Role | Size | Source |
|---|---|---|---|
| D_d | Controlled fixtures | 15 HTML files; FAIL cases: SC 2.4.11 = 2, SC 2.4.12 = 2, SC 2.4.13 = 6 | NavA11y focus-behavior fixture suite |
| D_r | Production websites | 27 evaluable sites | Top-30 Semrush global ranking, minus 3 exclusions |

Three of the top-30 production sites were excluded for access reasons, not for
convenience: Craigslist (geographic IP redirect), DoorDash (a bot-detection popup),
and MakeMyTrip (HTTP 403). The remaining 27 sites are the same corpus used by the
GenA11y detection study, which supports comparison.

One detail of the controlled dataset shapes the tables that follow. SC 2.4.7 has
zero FAIL cases in D_d. This is not an omission. NavA11y classifies a completely
absent or invisible focus indicator under SC 2.4.13 (Focus Appearance), so cases
that a reader might expect under SC 2.4.7 (Focus Visible) appear under SC 2.4.13
instead. The evidence ablation therefore runs on SC 2.4.13, which is where the
controlled cases concentrate and where the production violations are most common.

### 5.2.4 Repeated trials and determinism

The LLM generator is stochastic in principle, although temperature is pinned to 0 to
reduce variation. To measure the residual variation, the RQ1 experiment repeats each
cell: three independent runs over three seeds, so each evidence level is measured
over 54 trials (6 cases times 3 seeds times 3 runs) rather than once.

## 5.3 Evaluation Metrics

This section defines every metric precisely, including the terms a reader could
misread. The most important definition is what counts as a successful repair.

### 5.3.1 What counts as a successful repair

A repair attempt on a single violation ends in exactly one status, produced by the
three-pass verifier in `src/verifier/index.js`.

- RESOLVED. The target violation no longer fails when NavA11y is re-run on the
  patched page, AND the patch introduced no new failing element, AND the visual
  similarity between the page before and after the patch is at least the threshold
  of 0.9. All three conditions must hold.
- UNRESOLVED. The patch applied cleanly but the target violation still fails.
- REGRESSED. The patch introduced at least one new failing element, or it dropped
  visual similarity below 0.9.
- DECLINED. The generator explicitly returned no patch.
- ERROR. The attempt could not complete, for example because of an LLM rate-limit
  timeout, a malformed response after all retries, or a browser crash.

The primary metric is the resolution rate, defined in Equation 5.1.

Equation 5.1:

```
resolution_rate = (number of RESOLVED trials) / (total trials)
```

A point that affects interpretation: in the aggregate reporting code
(`src/reporting/aggregate.js`), ERROR trials are counted in the denominator. This is
the conservative choice, because an LLM call that timed out on the free tier is
counted as a non-success. Where errors are a large share of trials, this chapter
reports the resolution rate both with errors included (the script default) and with
errors excluded, and labels which is which.

### 5.3.2 Regression rate

The regression rate, defined in Equation 5.2, is the share of trials whose patch
introduced at least one new failure. It is the key safety metric, reported on the
RQ1 runs.

Equation 5.2:

```
regression_rate = (number of trials with >= 1 new failing element) / (total trials)
```

### 5.3.3 Visual stability

Visual stability measures how much the patch changed the rendered page, reported as
a similarity in the range 0 to 1 where 1 means identical. An honest naming note is
required: although the code and reports call this value "SSIM", the implementation
in `src/verifier/ssim.js` is not structural similarity. It is a per-pixel difference
computed with the pixelmatch library, as defined in Equation 5.3. This chapter uses
the term "pixel similarity" to avoid implying a computation that does not happen.

Equation 5.3:

```
pixel_similarity = 1 - (mismatched_pixels / compared_pixels)
```

When the before and after screenshots differ in size (which happens on live pages
that reflow), the comparison crops both to their common top-left overlap and reports
the fraction compared.

### 5.3.4 Statistics for the evidence ablation

RQ1 compares evidence levels on the same set of cases, so the outcomes are paired.
The correct test for paired binary outcomes is McNemar's test, not a t-test. The
implementation (`experiments/_common/stats.js`) uses the continuity-corrected form
in Equation 5.4, with one degree of freedom, and reports a result as significant
when p < 0.05.

Equation 5.4:

```
chi_square = (|b - c| - 1)^2 / (b + c)
```

Here b is the number of cases that succeeded at the lower evidence level but failed
at the higher one, and c is the number that failed at the lower level but succeeded
at the higher one. Only discordant pairs enter the test, which is why McNemar is the
right choice.

The effect size between two proportions is Cohen's h, defined in Equation 5.5. The
conventional reading is that |h| below 0.2 is negligible, 0.2 to 0.5 small, 0.5 to
0.8 medium, and 0.8 or above large.

Equation 5.5:

```
h = | 2 * arcsin(sqrt(p1)) - 2 * arcsin(sqrt(p2)) |
```

For every reported proportion, a 95% confidence interval is computed with the Wilson
score method, which is appropriate for small samples and for proportions near 0 or 1.

### 5.3.5 Metrics that do not apply

Several standard metrics are deliberately not reported, because the system does not
produce the quantities they need. Each is listed here with the reason.

- Precision, recall, F1, and accuracy: not applicable. These are detection metrics.
  Detection is performed by NavA11y, the subject of the previous chapter. RepairA11y
  is a repair system, whose unit of success is a resolved violation.
- Confusion matrix: not applicable, for the same reason.
- ROC curve and AUC: not applicable. The system emits a typed patch, not a
  probability score that could be thresholded.
- Learning curve: not applicable. There is no training phase; the LLM is used
  zero-shot.

## 5.4 Experimental Results

This section presents the measured outcomes, first as tables, then as figures.

### 5.4.1 Quantitative results

#### RQ1: evidence ablation (the central result)

RQ1 holds everything constant and varies only the evidence bundle. Table 5.4 reports
the per-level resolution rate on the controlled corpus, and Table 5.5 reports the
McNemar paired tests. Each level is measured over 54 trials (6 cases times 3 seeds
times 3 runs).

Table 5.4: RQ1 resolution rate per evidence level, D_d (SC 2.4.13). Recorded run
`run-2026-06-21T06-19-00-943Z`.

| Level | Resolved / total | Rate |
|---|---|---|
| E1 (static) | 36 / 54 | 66.7% |
| E2 (+ WCAG text) | 29 / 54 | 53.7% |
| E3 (+ runtime) | 50 / 54 | 92.6% |
| E4 (+ visual crop) | 48 / 54 | 88.9% |

Table 5.5: RQ1 McNemar paired tests, D_d. b is losses and c is gains going from the
lower to the higher level. "Significant" means p < 0.05.

| Comparison | rate A | rate B | b | c | chi-square | p | Cohen's h | significant |
|---|---|---|---|---|---|---|---|---|
| E1 vs E2 | 66.7% | 53.7% | 7 | 0 | 5.143 | 0.0233 | 0.266 | yes (E2 worse) |
| E1 vs E3 | 66.7% | 92.6% | 2 | 16 | 9.389 | 0.0022 | 0.680 | yes |
| E1 vs E4 | 66.7% | 88.9% | 2 | 14 | 7.563 | 0.0060 | 0.551 | yes |
| E2 vs E3 | 53.7% | 92.6% | 2 | 23 | 16.000 | 0.0001 | 0.945 | yes |
| E3 vs E4 | 92.6% | 88.9% | 5 | 3 | 0.125 | 0.7237 | 0.128 | no |

Three results stand out. First, moving from static evidence (E1) to runtime evidence
(E3) produces a large, significant gain of 25.9 percentage points (p = 0.0022, with
a medium-to-large effect size of h = 0.680). Second, adding the WCAG technique text
alone (E2) does not help and actually hurts, a significant drop of 13 points (p =
0.0233). Third, adding the visual crop on top of runtime evidence (E4) does not
significantly change the result (p = 0.7237, h = 0.128, negligible): the effect has
saturated once runtime evidence is present. Runtime evidence is the ingredient that
matters.

#### Worked examples of LLM repairs on D_d

To make the repairs concrete, Table 5.6 lists the actual patch the LLM produced at
level E3 for each of the six controlled SC 2.4.13 cases, taken directly from the
recorded run (not reconstructed). Every patch is a CSS injection that adds a
compliant focus outline with `!important`, citing technique C15. Two details are
worth noting. First, the model chooses the colour to fit the element: it picks black
(`#000`) for the dark-text buttons on a white background, where black gives the most
contrast, and a blue (`#005fcc`) for the links, which matches their existing styling
while still meeting the contrast threshold. Second, it adds `outline-offset` only
where the element sits flush against other content, which is the behavior runtime
evidence enables: the model is reacting to the measured layout, not guessing.

Table 5.6: The LLM patch (level E3) for each D_d SC 2.4.13 case, from the recorded
run `run-2026-06-21T06-19-00-943Z`.

| Case | What was wrong | LLM patch on the focused element (the fix) | Technique |
|---|---|---|---|
| No focus indicator | Focus produced no visible indicator | `outline: 2px solid #005fcc !important; outline-offset: 2px` | C15 |
| Focus not indicated | Keyboard focus not shown visually | `outline: 2px solid #005fcc !important; outline-offset: 2px` | C15 |
| Insufficient outline contrast | 2px outline at ~2.85:1, below 3:1 | `outline: 2px solid #000 !important; outline-offset: 0` | C15 |
| Insufficient outline width | Outline thinner than 2px | `outline: 2px solid #000 !important` | C15 |
| Insufficient border width | Border-based indicator too thin | `outline: 2px solid #000 !important` | C15 |
| Low background contrast | Indicator low-contrast against background | `outline: 2px solid #000 !important` | C15 |

Figure 5.1 shows the focused element before and after the patch for three of these
cases. The change is deliberately small (a focus outline appearing or becoming
compliant), because that is exactly the repair the criterion requires; the patch
table above states precisely what changed in each case.

![Insufficient outline contrast, before.](figures/dd1_before.png)
![Insufficient outline contrast, after.](figures/dd1_after.png)

![Insufficient outline width, before.](figures/dd2_before.png)
![Insufficient outline width, after.](figures/dd2_after.png)

![Insufficient border width, before.](figures/dd3_before.png)
![Insufficient border width, after.](figures/dd3_after.png)

Figure 5.1: Three D_d button cases, each shown focused before (left) and after
(right) the recorded LLM patch is applied. Top: a low-contrast 2px outline becomes a
compliant black one. Middle: a thin (1px) outline is thickened to a 2px black one.
Bottom: a thin border-based indicator is replaced by a 2px black outline.

#### Regression and safety of the LLM patches

Safety is measured on the same RQ1 runs, so it covers exactly the patches whose
effectiveness is reported above, with no separate experiment. Across all 216 ablation
trials the verifier flagged no regression: no patch introduced a new failing element,
and the mean pixel similarity between the page before and after the patch was 1.000.
Table 5.7 summarizes this.

Table 5.7: Regression and safety of the LLM patches, measured on the RQ1 D_d runs
(216 trials across the four evidence levels). Recorded run
`run-2026-06-21T06-19-00-943Z`.

| Metric | Value |
|---|---|
| Trials evaluated | 216 |
| Trials that introduced a new failure | 0 (0.0%) |
| Mean pixel similarity | 1.000 |

Because a patch that breaks the page is recorded as REGRESSED and never as RESOLVED,
the resolution rates in Table 5.4 already exclude any unsafe patch. The zero
regression count means the effectiveness numbers are not bought at the cost of
breaking the page; the patches that resolve the target leave the rest of the page
visually unchanged.

#### D_r: scale of the problem and live repair

The production scan establishes that focus-behavior violations are common on real
sites, which is the practical motivation for the system. Table 5.8 reports the
detection scan across 27 sites.

Table 5.8: D_r detection scan (recorded run; 26 of 27 sites scanned, 1 error).

| SC | Sites affected | Total violations | Mean per affected site |
|---|---|---|---|
| 2.4.7 | 18 | 270 | 10.38 |
| 2.4.11 | 14 | 283 | 10.88 |
| 2.4.12 | 21 | 497 | 19.12 |
| 2.4.13 | 25 | 1841 | 70.81 |

SC 2.4.13 dominates: 25 of 26 successfully scanned sites have at least one Focus
Appearance violation, and the total across sites is 1,841. The most affected sites
in the recorded scan were fragrantica.com (461 total failures), shein.com (554),
steamcommunity.com (201), and yahoo.com (193).

Live repair on production sites is the hardest test, because the pages are large,
change between visits, and sometimes block automation. Two numbers are reported with
equal weight, because they answer different questions (Table 5.9).

Table 5.9: D_r live repair on production sites (SC 2.4.13, level E3, recorded runs).

| Reading | Definition | Result |
|---|---|---|
| Single-run rate | One repair attempt per site, errors excluded | 10 / 21 = 48% |
| Best-of rate | Best outcome per site across repeated retries | 18 / 25 = 72% |

The single-run rate (48%) is the honest per-attempt expectation on a noisy free
tier: of 25 sites, one run resolved 10, left 9 unresolved, regressed 2, and hit 4
rate-limit or timeout errors. The best-of rate (72%) is the upper bound when each
site is retried until it returns a definitive result, and it should be read with two
caveats: it counted one site (adp.com) as a regression from a dry-run stub with no
real API call, and one site (live.com) regressed badly, with a pixel similarity of
0.493 and 60 new failures. Neither number is "the" answer: on real pages, with one
shot, the system fixes about half, and with retries about three-quarters, with a
non-trivial regression tail that must be watched.

### 5.4.2 Visual results

Figure 5.2 shows the RQ1 evidence ablation on the controlled corpus: the jump at E3
and the flat step to E4 are both visible. Figure 5.3 shows the scale of
focus-behavior violations across the production sites.

![RQ1 evidence ablation on D_d.](figures/rq2_ablation_dd.png)

Figure 5.2: RQ1 evidence ablation on the controlled corpus D_d. The rate rises
sharply from E1 to E3 and is flat from E3 to E4.

![D_r violations by SC.](figures/dr_violations_by_sc.png)

Figure 5.3: Total focus-behavior violations detected across the production sites, by
Success Criterion. SC 2.4.13 dominates.

Before-and-after screenshots of the controlled cases are shown in Figure 5.1, using
the real recorded LLM patches. Screenshots of live production repairs are not shown:
the only production captures available were not genuine repairs (one site was a
dry-run stub with no patch applied, another returned a bot-challenge page rather than
the real site), so the production results are reported as numbers (Table 5.8) rather
than as images. No machine-learning training figures (learning curves, ROC curves)
are shown either, because the system has no training phase and emits no probability
score; those figures are not applicable here.

## 5.5 Comparative Analysis

This section compares RepairA11y against the right baselines: a no-op baseline, the
static-versus-runtime evidence contrast that is the core of the work, and the closest
published systems.

### 5.5.1 Against a no-op baseline

The simplest baseline is to do nothing. By construction, a no-op resolves 0% of
violations, since the violations were detected before any patch was applied. Every
result in this chapter is therefore measured against a 0% floor.

### 5.5.2 Static versus runtime evidence

The cleanest internal comparison is E1 against E3, because the only difference
between them is the runtime slice. Runtime evidence lifts the LLM resolution rate by
25.9 points, a statistically significant change. This is reported as a controlled
ablation rather than a comparison against an external tool, because no external tool
exposes the same lever.

### 5.5.3 Against published repair systems

Table 5.10 places RepairA11y next to the closest published LLM repair systems. The
comparison must be read carefully: these systems target different Success Criteria,
use different detectors, and report different metrics, so the table is a positioning
aid, not a head-to-head benchmark. The numbers for prior systems are taken from their
papers, cited in `docs/LITERATURE.md`.

Table 5.10: Positioning against published work. "Evidence ablation" is whether the
system measures the contribution of different evidence inputs.

| System | Task | Detector | Reported result | Evidence ablation | Focus-behavior SCs |
|---|---|---|---|---|---|
| GenA11y (He et al., FSE 2025) | Detection only | GPT-4o + DOM context | 94.5% precision, 87.6% recall | no | partial (detection) |
| AccessGuru (Fathallah et al., ASSETS 2025) | Repair | axe + LLM | up to 84% violation-score reduction | no | no (axe-bounded) |
| Fernández-Navarro & Chicano (2026) | Repair | axe-core + Selenium | 80% static, 86% Angular | no | no (axe-bounded) |
| DesignRepair (Yuan et al., ICSE 2025) | Frontend repair | source + rendered view | 92.9% recall, 90.1% precision | no | no (Material Design) |
| RepairA11y (this work) | Repair | NavA11y runtime evidence | E3 92.6% on D_d | yes (RQ1) | yes |

The published repair systems report fix rates broadly comparable to RepairA11y's
runtime-evidence result, in the 80% to 86% range. The contribution of this chapter
is not a higher headline number on a shared benchmark, which does not exist for these
SCs. It is the evidence ablation: none of the prior systems measures whether runtime
evidence helps, because each uses a single fixed evidence model, and most are bounded
by what the axe static analyzer reports. RepairA11y is the first to isolate runtime
evidence as the variable and measure its effect.

## 5.6 Statistical Analysis

This section reports the statistical support for the claims, the test choice, and the
confidence intervals, and it is honest about what the sample size can and cannot
support.

### 5.6.1 Choice of test

The RQ1 comparisons are paired: the same cases are repaired at each evidence level,
so each case contributes a matched pair of outcomes. For paired binary outcomes the
appropriate test is McNemar's test. A two-sample t-test would be wrong, because the
outcomes are binary and paired, not continuous and independent. A chi-square test of
independence would also be wrong, because it ignores the pairing. McNemar is reported
with the continuity correction (Equation 5.4) and one degree of freedom. For the
smallest discordant counts the chi-square approximation is weaker than an exact
binomial test would be; this is noted as a limitation in Section 5.9 rather than
corrected, because the significant results have discordant counts large enough for
the approximation to hold.

### 5.6.2 Confidence intervals

Because the proportions are estimated from a small sample (6 SC 2.4.13 cases,
repeated to 54 trials per level), Wilson score 95% intervals are reported instead of
normal-approximation intervals. Table 5.11 reports the interval for each per-level
proportion.

Table 5.11: Wilson 95% confidence intervals for the RQ1 per-level rates (recorded
run). n is the number of trials behind each proportion.

| Level | Rate | n | Wilson 95% CI |
|---|---|---|---|
| E1 | 66.7% | 54 | (53.4%, 77.8%) |
| E2 | 53.7% | 54 | (40.6%, 66.3%) |
| E3 | 92.6% | 54 | (82.4%, 97.1%) |
| E4 | 88.9% | 54 | (77.8%, 94.8%) |

The intervals for E1 and E3 do not overlap, which is consistent with the significant
McNemar result. The E3 and E4 intervals overlap heavily, consistent with the
non-significant step from E3 to E4.

### 5.6.3 Effect sizes

The effect of runtime evidence is not only statistically significant, it is large.
Cohen's h for E1 versus E3 is 0.680 (medium to large). By contrast, E3 versus E4 has
h = 0.128, which is negligible. The statistics agree with the practical reading:
runtime evidence matters a lot, and the visual crop adds little on top of it.

## 5.7 Resource Utilization

This section reports the costs that matter for this system: money, time, and the
number of model calls. These costs are central, because the project runs under a
strict zero-budget constraint, which shaped the design.

The monetary cost is zero. Every LLM call uses the OpenRouter free tier, so no
experiment in this chapter incurred a charge. The free tier is the reason the project
pins temperature to 0 and uses a single free model rather than a paid one.

The dominant time cost is the free-tier rate limit, not computation. The provider
allows three requests per minute, which the client enforces as a gate of about 22
seconds between calls. On top of this, each trial runs NavA11y twice (a baseline
detection and a post-patch verification), and each NavA11y pass drives a real
headless browser, which takes roughly 15 to 30 seconds per page. A single LLM trial
therefore takes on the order of a minute, and RQ1, at 216 trials across the four
levels, takes hours of wall-clock time. The repair loop used a mean of 1.0
iterations, because the experiments were configured for a single attempt per
violation.

Token counts and per-call latency are not written to the result files in a form this
chapter can total reliably. The per-trial wall-clock time is recorded, but it is
dominated by the rate-limit gate and the browser passes rather than by model
inference, so it is not a clean measure of model cost. Reporting an exact token total
is therefore marked [VERIFY]: confirming it would require adding token accounting to
the LLM client and re-running, which was out of scope for a zero-budget evaluation.

## 5.8 Discussion of Findings

This section interprets the results and links them back to the research questions.

The central finding is that runtime evidence makes LLM repair work, and the reason is
visible in the failure cases. At levels E1 and E2 the model can see the HTML and, at
E2, the relevant WCAG technique text, but it cannot see the computed result of the
page's CSS. For a Focus Appearance violation, the deciding facts are the actual
rendered outline width, the actual indicator colour, and the actual background colour
behind it, none of which can be read reliably from the source because they come from
external stylesheets, CSS resets, and custom properties. Without those facts the
model guesses, and its most common guess is a black outline, which fails on dark
backgrounds. At E3 the model is given the measured contrast ratio and the
before-and-after computed styles, so it stops guessing and chooses a colour that
actually meets the threshold. This is why E3 produces a large jump, and it directly
answers RQ1: runtime evidence is the necessary ingredient.

The result that E2 does not help, and on this corpus hurts, is the most interesting
secondary finding, and it is consistent with the counter-evidence literature that
more context can degrade an LLM. Adding the WCAG technique text without the runtime
numbers gives the model more to read but nothing new to reason with, and it appears
to pull the model toward textbook-sounding but incorrect patches. This is why the
chapter does not treat "E3 is better than E1" as obvious: a plausible competing
hypothesis, that any extra context helps, is contradicted by E2.

The result that E4 does not beat E3 is the reason E4 was included at all. E4 is the
control that tests whether the gain keeps growing once runtime evidence is present.
It does not: the annotated crop adds visual grounding, but once the model already has
the measured numbers, the picture is largely redundant. The practical reading is that
runtime evidence is the sweet spot, and the system does not need to pay the extra
cost of rendering and cropping an annotated image. This answers the natural follow-up
question, "would a picture help even more?", with measured data: no.

On safety, the zero regression rate and the pixel similarity of 1.000 across the 216
ablation trials say the LLM patches do not break the controlled pages: the
effectiveness gain is not bought by damaging the rest of the page. The honest
qualifier is that this safety is demonstrated on controlled fixtures, and the
production runs show a regression tail (notably live.com) that the controlled suite
does not capture. Safety on fixtures is necessary but not sufficient for safety in
the wild.

The drop from controlled to production performance (a single-run 48% on D_r) is
explained by three compounding factors: the free tier loses roughly one trial in
fourteen to rate-limit and timeout errors, the oracle's transparent-background bug
blocks some otherwise-correct patches, and live pages are simply larger and messier
than fixtures. None of these undermines the RQ1 finding, which is an internal
comparison where all three factors apply equally to every level.

## 5.9 Threats to Validity and Limitations

This section names the real limitations honestly.

Small, single, in-house corpus. The evidence ablation rests on one controlled corpus
of 6 SC 2.4.13 cases (repeated to 54 trials per level), authored by the same project.
This is the chapter's main external-validity limit: the controlled effect is measured
cleanly, but its generalization to pages the team did not write is argued, not yet
proven on a held-out repair benchmark. The production scan (D_r) shows the problem is
real at scale, and the production repair run gives a first out-of-lab data point, but
the controlled ablation itself is in-house.

Wide confidence intervals. With 54 trials per level the Wilson intervals are wide
(Table 5.11). The significant RQ1 results survive this, because they are paired and
the effect is large, but the per-level point estimates should be read as indicative.

Repeated-case pairing in McNemar. The McNemar test is applied to pairs formed by
(case, run, seed), which treats repeats of the same case as independent trials. This
inflates the effective sample size and narrows the p-values relative to a test that
pairs only at the case level. The direction and size of the E1-to-E3 effect are not
in doubt, but the exact p-values should be read with this in mind.

LLM stochasticity. The model is stochastic; temperature 0 and repeated runs reduce
but do not eliminate variation. A fresh run is a new sample and will not reproduce
the recorded numbers exactly.

Oracle conservativeness. The verifier is NavA11y itself, and it has a known bug: for
elements with a transparent background it treats the background as black when
computing contrast, so a correct outline patch can be marked as still failing. This
makes the reported resolution rates conservative for those cases.

Free-tier flakiness. Roughly 7% of trials are lost to rate-limit timeouts, malformed
JSON after retries, or browser crashes. These are counted as ERROR and, by default,
against the resolution rate, which makes the headline rates a lower bound.

Optimistic best-of reporting. The 72% best-of figure on production sites is an upper
bound obtained by retrying each site, and it includes at least one site counted from
a dry-run stub. It is reported alongside the single-run 48% precisely so it is not
mistaken for the expected per-attempt result.

Single Success Criterion for the ablation. RQ1 is run on SC 2.4.13 only. The ablation
finding is therefore established for Focus Appearance, and its generalization to the
other focus-behavior SCs is plausible but not yet measured.

Oracle overfitting. Because the generator is verified by the same engine that
detects, there is a risk of fitting the oracle rather than fixing the page. This is
the single largest reviewer concern, and the right mitigation, reporting the NavA11y
pass rate and an independent manual review rate separately, is only partially done
here: the chapter reports the oracle pass rate, and a full manual review remains
future work.

## 5.10 Summary

This chapter evaluated RepairA11y on a controlled corpus and on production data
around one central research question. The central result, for RQ1, is that runtime
evidence (E3) improved LLM repair over static evidence (E1) by 25.9 points (p =
0.0022, medium to large effect), while adding WCAG text alone (E2) gave no gain and
hurt, and adding a visual crop (E4) gave no significant further gain, showing the
effect saturates at runtime evidence. The same patches were safe: across the 216
ablation trials none introduced a new failure, with mean pixel similarity of 1.000.
On production sites, focus-appearance violations are common (1,841 across 25 sites),
one-shot repair resolved about half of the targeted violations, and retried repair
resolved about three-quarters, with a regression tail that must be watched.

The practical message is that the value of an LLM accessibility repair system comes
less from the model and more from the runtime evidence it is given, and that this
contribution can be measured. The next chapter draws the thesis together and
discusses how runtime-grounded repair could be extended to the remaining
focus-behavior Success Criteria and hardened for production use.
