# RepairA11y — Methodology

This document describes the methodology of the RepairA11y system: its
position in the research landscape, the architectural choices that
underpin the pipeline, the experimental design used to evaluate it, and
the statistical and human-validation procedures we apply to its outputs.
It is written to be the seed of a thesis Chapter 2 methodology section,
not as developer documentation. (For a developer-oriented walkthrough,
see `GUIDE.md` and `WALKTHROUGH.md`.)

---

## 1. Research framing

### 1.1 Problem

Modern web pages frequently violate WCAG 2.4 success criteria related
to keyboard focus behavior — focus indicators that are invisible,
focus indicators that fail contrast and area thresholds, and focused
elements obscured by sticky chrome (headers, footers, cookie banners).
These violations are **runtime** in nature: they depend on the
computed visual state of the page once focus has actually landed on
an element, and on the live stacking and positioning context of the
DOM. Static analyzers built only on the source HTML cannot reliably
identify them.

The companion project, NavA11y (Chapter 1 of the same thesis), closed
the detection gap for four such success criteria — SC 2.4.7, 2.4.11,
2.4.12, and 2.4.13 — by instrumenting a Playwright browser to focus
each candidate element, snapshot the resulting computed styles, and
classify the focus state against WCAG requirements. NavA11y reports
violations as machine-readable records but does not propose fixes.

**RepairA11y addresses the repair gap.** Given a NavA11y violation
record, can the system automatically generate, apply, and validate a
small code-level patch that resolves the violation without introducing
regressions?

### 1.2 Research questions

We pose two research questions, scoped tightly to the four target
success criteria. Two further questions — one on loop-iteration
impact, one on a developer-utility study — have been documented in
earlier scoping work and deferred from this chapter to keep the
contribution focused.

- **RQ1 — Does runtime evidence help LLM-based repair?** When an LLM
  is asked to fix a focus-behavior violation, does adding the runtime
  measurements that NavA11y already collected — the focused-state
  CSS, the measured contrast ratio, which element is covering the
  focused one, and the tab order — produce more correct patches than
  giving the LLM only the page's HTML and a screenshot? *This is the
  central claim of the chapter.*

- **RQ2 — How well do the generators perform in practice?** We
  compare two generators (a hand-authored rule-based generator and
  the LLM-based generator) along two dimensions:
  - **RQ2.1 (Effectiveness):** Across the four target SCs, what
    fraction of violations does each generator resolve on the
    controlled dataset (D_d) and the production dataset (D_r)?
  - **RQ2.2 (Regression):** Do those patches break anything else? We
    measure how often a patch introduces a new accessibility failure,
    how much the page changes visually (SSIM), and how invasive each
    patch is (selector specificity).

RQ1 isolates the evidence variable on the LLM path; RQ2 places both
generators side-by-side and asks whether the patches they emit are
useful in practice. RQ1 is the thesis claim; RQ2 is what tells the
reader whether the system is worth using at all.

### 1.3 Positioning against related work

Recent automated work on web accessibility falls into three groups
(see `docs/LITERATURE.md` for verified citations and `docs/papers/`
for PDFs). (a) **Static-rule fixers** (axe-driven linters) operate on
the HTML and accessibility tree without runtime grounding; they
target alt-text, ARIA, and form-label categories. (b) **LLM repair
systems** prompt a language model with the HTML context and an
axe-style violation summary: AccessGuru (Fathallah et al., ASSETS
2025) reports up to 84% violation-score reduction;
Fernández-Navarro & Chicano (2026) report 80% on static sites and
86% on Angular SPAs. Both are axe-bounded and neither performs
evidence-level ablation. (c) **Visual-grounding systems** such as
DesignRepair (Yuan et al., ICSE 2025) use UI screenshots and design
guideline retrieval but target Material Design conformance, not
WCAG. On the detection side, GenA11y (He et al., FSE 2025)
demonstrates LLM-based detection of 37 WCAG SCs at 94.5% precision
and 87.6% recall but does not propose repairs.

RepairA11y differs along two axes. First, its evidence model is
**runtime-grounded by construction**: every repair receives the same
computed style snapshots and obscuration measurements that NavA11y
used to detect the violation, so the repair signal is symmetric with
the detection signal. Second, the system is structured as a
**typed-patch pipeline** with an independent verifier, so the
question "did the repair succeed?" is decoupled from the question
"who proposed the repair?" The verifier reruns NavA11y on the
patched page, performs cross-run violation matching, and compares
visual snapshots — without consulting the generator.

---

## 2. System architecture

The system is a five-stage pipeline orchestrated by a thin repair
loop. Each stage has a single responsibility, a well-defined input/
output contract, and an independent test suite. The pipeline is
implemented as plain JavaScript functions — no agent framework, no
chained-tool middleware — to keep the experimental surface area
small and the data flow auditable.

```
   ┌───────────┐   ┌───────────┐   ┌───────────┐   ┌───────────┐   ┌───────────┐
   │  Stage 1  │   │  Stage 2  │   │  Stage 3  │   │  Stage 4  │   │  Stage 5  │
   │  Detect   │──▶│  Package  │──▶│  Generate │──▶│  Apply    │──▶│  Verify   │
   │  (NavA11y)│   │  evidence │   │  patch    │   │  patch    │   │  outcome  │
   └───────────┘   └───────────┘   └───────────┘   └───────────┘   └───────────┘
                                        ▲                              │
                                        └──── repair loop (retry) ─────┘
```

### 2.1 Stage 1 — Detection

The detector wraps NavA11y as a subprocess and normalizes its
`results.json` output into typed violation records. Each record
carries the success criterion, the verdict (`FAIL`/`PASS`/`REVIEW`),
the element's selector and bounding box, an evidence sub-object whose
shape is SC-specific (style snapshots, obscurer arrays, tab
sequences), and a synthesized stable identifier (NavA11y reissues
UUIDs on every run, so we cannot rely on its raw IDs for cross-run
matching).

### 2.2 Stage 2 — Evidence packaging

The evidence packager is the experimental lever for RQ1. Given one
violation record, it produces a single typed bundle at one of four
strictly monotonic levels:

| Level | Contents |
|-------|----------|
| E1 | element `outerHTML` + full-page screenshot reference |
| E2 | E1 + W3C-WAI technique excerpts relevant to the SC |
| E3 | E2 + per-SC runtime slice (style snapshots, contrast, obscurer details) |
| E4 | E3 + annotated element-crop screenshot (PNG) |

The "monotonic" property is enforced by the implementation and
validated by a unit test: `|E1| < |E2| < |E3| < |E4|`. This means any
observed difference in downstream LLM behavior can be attributed to
the *added* information, not to substitution.

E3 is the level at which detection-derived runtime measurements first
enter the prompt. The hypothesis underlying RQ1 is that the step from
E2 to E3 produces the largest single improvement in resolution rate.

### 2.3 Stage 3 — Generation

The pipeline supports two generator families, swappable at the
function-call interface:

- **Rule-based generators** (one module per SC) are deterministic
  JavaScript functions that pattern-match on the runtime slice and
  emit typed patches. They serve two purposes: as a competitive
  baseline for RQ2.1, and as a sanity check on the rest of the
  pipeline — any failure in detection, application, or verification
  surfaces first against the deterministic baseline before being
  attributed to LLM stochasticity.
- **LLM-based generators** construct an SC-specific prompt from the
  evidence bundle (assembled by Stage 2) and ask a language model
  for a JSON patch conforming to our schema. We use OpenRouter's
  free-tier API to remove model-pricing variables from the design
  and to make reruns reproducible across sites.

Every patch — regardless of producer — is validated against a single
JSON Schema (`src/schemas/patch.schema.json`) with four allowed
`patch_type` values: `css_inject`, `style_override`, `attr_set`,
`dom_reorder`. The schema is the contract between generators and the
applier: a generator that cannot satisfy it returns `null` ("decline"),
not an unstructured fragment.

The schema also bounds the search space. Generators cannot propose
arbitrary script changes, framework refactors, or component
substitutions; they can only propose one of the four atomic mutations
the applier knows how to undo. This is by design — it makes the
system's outputs auditable and the verifier's job tractable.

### 2.4 Stage 4 — Application

The applier executes the typed patch on a Playwright-controlled DOM
copy of the target page. Each handler returns a reversible undo
closure that restores the pre-patch DOM byte-for-byte, captured via
Playwright `ElementHandle`s rather than re-querying by selector
(because the patch itself may have mutated the very attributes the
selector depended on).

### 2.5 Stage 5 — Verification

Verification is the methodological keystone. To avoid the oracle
overfitting that has been identified as the principal validity threat
in this literature, the verifier consults *NavA11y* — the same
detector that produced the violation in Stage 1 — and not the
generator's self-reported intent. Three independent passes are
performed:

1. **Target resolution.** The pre-patch and post-patch violation
   lists are diffed by the canonical `(SC, element-selector)` pair.
   The target violation must be present in the pre-patch list and
   absent from the post-patch list.
2. **Regression detection.** Any FAIL appearing in the post-patch
   list that was not in the pre-patch list is flagged as a
   regression. (This catches patches that resolve the target but
   break neighboring elements — most often when a z-index bump
   pushes the focused element above content it should sit beneath.)
3. **Visual stability.** A full-page screenshot is captured before
   and after, and pixel-matched via `pixelmatch`; the resulting
   similarity index ∈ [0, 1] is recorded. Patches that mutate
   structural layout register here even when the verdict from passes
   1 and 2 is clean.

The verifier returns one of four states: `RESOLVED`, `UNRESOLVED`,
`REGRESSED`, `ERROR`. The repair loop consumes this verdict and
either accepts the patch (RESOLVED) or feeds the failure context
back into the generator for another attempt, up to a configurable
maximum (default 3).

---

## 3. Datasets

The evaluation uses three datasets with complementary roles.

### 3.1 D_d — controlled fixtures

D_d is the NavA11y focus-behavior fixture set: 158 hand-authored
HTML pages, each constructed to exercise a single WCAG success
criterion under controlled conditions. RepairA11y indexes the
14 fixtures most relevant to its four target SCs in
`src/datasets/dd.js`. D_d serves as the primary surface for
deterministic experiments and for unit-style regression checks of
the generators.

### 3.2 D_r — production sites

D_r is the production-site list from the NavA11y evaluation
(27 of the Semrush top 30, with 3 sites excluded for IP redirect,
bot-detection, and 403 responses). D_r tests external validity:
do generators that succeed on hand-crafted fixtures still resolve
violations in the wild, where stacking contexts, third-party
scripts, and CSS-in-JS pollute the runtime environment?

### 3.3 D_new — release artifact

D_new is a small, hand-curated set of three additional fixtures
released as a reproducibility artifact alongside the thesis
(`datasets/dnew/`). The cases exercise patterns under-represented in
D_d: modal-close obscured by translucent backdrop, text input with
1px subtle focus indicator, and positive-tabindex misuse in a real
navigation context.

---

## 4. Experimental design

### 4.1 RQ1 — Evidence ablation (core claim)

The RQ1 experiment fixes the corpus (D_d FAIL records for the chosen
SC) and the generator family (LLM) and varies the evidence level.
Each (case, seed, level) triple is treated as a paired observation
across levels.

The full publication-grade design is:

```
4 levels (E1..E4) × 3 seeds × N cases × 10 runs
```

For SC 2.4.13 (the corpus where we have ground-truth patches), this
yields 4 × 3 × 8 × 10 = 960 trials. With OpenRouter free-tier rate
limits, wall-clock time is approximately 60–120 minutes spread
across one or two sittings.

Each trial records:
- the evidence bundle hash (for provenance)
- the model identifier and seed
- token usage
- the generated patch (or decline)
- the verifier's verdict including SSIM
- elapsed wall-clock time

Results are aggregated per level (mean and standard deviation of
resolution rate across runs) and per pairwise comparison (McNemar's
test, Cohen's *h*).

### 4.2 RQ2.1 — Effectiveness

The RQ2.1 experiment runs each generator over the union of D_d (FAIL
records only) and D_r, single-iteration, and reports per-SC
resolution rate. LLM runs are repeated across multiple seeds to
measure variance. Rule-based runs are executed once: they are
deterministic by construction. The script is
`experiments/rq1_effectiveness/run.js` (directory name retained for
reproducibility against earlier results files).

### 4.3 RQ2.2 — Regression analysis

The RQ2.2 experiment reuses the patches produced by RQ2.1 and
reports, per generator and per SC: regression rate (fraction of
cases where at least one new FAIL was introduced), mean SSIM (visual
stability), and mean selector specificity (a syntactic proxy for
invasiveness). A patch with high specificity targets a single
element narrowly; a patch with low specificity casts a wide net and
is more likely to have side effects. The script is
`experiments/rq4_regression/run.js` (directory name retained for
reproducibility against earlier results files).

---

## 5. Metrics and statistical procedure

### 5.1 Primary metrics

- **Resolution rate.** Proportion of FAIL records for which the
  pipeline's verifier returns `RESOLVED`.
- **Regression rate.** Proportion of accepted patches that
  introduce at least one new FAIL elsewhere on the page.
- **Visual similarity (SSIM).** Pixel-wise similarity (1 −
  diff_pixels / total_pixels) between pre- and post-patch full-page
  screenshots, in [0, 1]. Reported as the mean across cases.
- **Iterations.** Mean number of generator attempts the loop
  consumed before accepting (or giving up on) a patch.

### 5.2 Inferential statistics for RQ1

RQ1 compares LLM resolution rate at four evidence levels evaluated
on the same case set. The natural inferential test for paired
binary outcomes is **McNemar's test** (with continuity correction
for small N):

```
χ²₁ = (|b − c| − 1)² / (b + c)
```

where `b` is the count of cases resolved at level A but not at B,
and `c` is the converse. We pair observations by
`(case_id, seed, run_index)` so that variance from case difficulty
and seed-level LLM stochasticity is held constant; only the
evidence-level effect remains. We compute the χ² survival function
at 1 degree of freedom via the Abramowitz–Stegun approximation —
no external statistics library is required.

Alongside the p-value we report **Cohen's *h***:

```
h = |2·arcsin(√p₁) − 2·arcsin(√p₂)|
```

Cohen's *h* is the appropriate effect size for the difference
between two proportions and is invariant under proportion size,
which matters when our small corpus produces high or low
proportions where a small absolute change can be statistically
significant but practically irrelevant.

The significance threshold is α = 0.05 (two-tailed). We report
all five pairwise comparisons (E1↔E2, E1↔E3, E1↔E4, E2↔E3,
E3↔E4); the central comparison for the research claim is E1
versus E3.

### 5.3 Manual oracle validation

Automated verification via NavA11y is necessary but not sufficient.
NavA11y can confirm that the *measured* violation is gone, but it
cannot judge whether the patch is visually acceptable, whether it
preserves the original design intent, or whether it would survive
code review. To address this — and to address the oracle-overfitting
threat in particular — we apply a manual oracle to every accepted
patch.

The oracle workflow is operationalized by the `manual-review`
tool. For each repaired page (URL or fixture) it produces an
inspection bundle containing the baseline HTML, the patched HTML
(all patches applied), one isolated-patch HTML file per case, a
full-page screenshot for each, and a Markdown checklist with one
verdict per patch: **accept**, **revise**, or **reject**. The
reviewer (the thesis author) opens the baseline and patched
HTML files in adjacent browser tabs and Tabs through each element
to compare focus indicators visually, then records the verdict.

Per-patch oracle outcomes are persisted under
`experiments/oracle/<sc>_<generator>.json` and are reported
**alongside, not in place of**, the NavA11y verdict in every
results table. The two numbers in tandem provide the reader with
both the automated agreement signal and the human-acceptance signal,
making it transparent when one diverges from the other.

---

## 6. Threats to validity

### 6.1 Construct

The principal construct-validity risk is that NavA11y, used both as
the detection oracle and as the verification oracle, may be measuring
something other than human-perceived focus accessibility. We mitigate
this in two ways: (a) NavA11y's checks operate on browser-rendered
DOM state and computed styles using the same WCAG-defined thresholds
a human reviewer would consult, so the construct is grounded in the
standard; (b) the manual-oracle workflow exposes any divergence
between automated agreement and human acceptance, and divergence is
reported, not hidden.

### 6.2 Internal

The RQ1 experiment relies on independent draws across seeds and runs
for paired comparison. Free-tier LLM providers occasionally substitute
backend models without notice. We mitigate this by (a) recording the
model identifier in every result; (b) pinning the model via the
`OPENROUTER_MODEL` env var; and (c) re-running affected conditions
on the replacement model if substitution is detected mid-experiment.

The verifier's `(SC, selector)` matching key was selected because
NavA11y reissues UUIDs per run. This carries the risk that distinct
violations sharing a selector (e.g., page-level violations) collapse
to the same key. In practice, page-level violations are identified by
synthesized `page:<sc>` keys, and element-level selectors in NavA11y
output are descendant chains specific enough to disambiguate within
a single page.

### 6.3 External

The D_d corpus is authored by the same team as NavA11y and may
encode shared assumptions. We mitigate by reporting D_r as the
primary external-validity metric and by treating any D_d-only result
as a controlled finding, not a generalization. The D_r corpus itself
is bounded by Semrush's top-30 selection and is biased toward
English-language enterprise sites.

The thesis claim is bounded to the four target focus-behavior SCs.
Extension to other WCAG SCs is plausible but unverified; the typed-
patch schema and pipeline structure are SC-agnostic, but every new
SC requires (at minimum) a generator module and an evidence-slice
extractor.

### 6.4 Conclusion

The RQ1 corpus is small (N ≈ 8 SC 2.4.13 cases). To increase
statistical power we run 10 full replications and report effect
sizes alongside p-values, but the small N remains a limitation and
we report it explicitly. Where statistical significance is not
achieved on D_d, we treat the result as inconclusive rather than
negative.

---

## 7. Reproducibility

Every experimental component is in the public repository and is
runnable end-to-end on a fresh clone with three commands:
`npm install`, `npx playwright install chromium`, and
(for LLM runs) populating `.env` with an OpenRouter API key. Every
results file records the input options, the generator and model
identifiers, the per-case JSON outputs, and the rendered Markdown
report.

Hand-authored ground-truth patches for SC 2.4.13, SC 2.4.11, and
SC 2.4.3 are committed under `ground-truth/` and are exercised by
`scripts/batch-1-e2e.js` on every regression run, providing a
permanent fixed-point check that the full pipeline still resolves
known-good cases. The D_new artifact (3 hand-curated edge cases)
is committed under `datasets/dnew/` under CC-BY-4.0 for external
reuse.

---

## 8. Summary

RepairA11y is a five-stage typed-patch pipeline that consumes
NavA11y violation records and produces verified repairs for four
WCAG 2.4 focus-behavior success criteria. Its central
methodological contributions are: (a) a strictly monotonic four-
level evidence model that exposes runtime-evidence value as the
RQ1 ablation lever; (b) a verifier decoupled from the generator
that combines NavA11y re-detection, regression diffing, and visual
similarity into three independent checks; (c) a manual-oracle
workflow that pairs every automated verdict with a human verdict,
addressing the oracle-overfitting threat that has weakened prior
work in this area; and (d) full reproducibility including a fixed-
point ground-truth oracle and a CC-BY release artifact.

The experimental design (RQ1, RQ2.1, RQ2.2), the statistical procedure
(McNemar with continuity correction and Cohen's *h*), the dataset
strategy (controlled D_d, production D_r, release D_new), and the
threats-to-validity analysis above together provide a methodology
that is auditable, reproducible, and structured for direct
adaptation to additional WCAG success criteria in future work.
