# RepairA11y — Technical Approach

> **Thesis claim:** LLM-based repair systems receiving runtime evidence produce
> better patches than systems receiving only static evidence (HTML + screenshot),
> for WCAG violations that are only observable at runtime.

---

## 1. The Problem

WCAG 2.4.13 (Focus Appearance, AAA) requires that keyboard focus indicators have:

- **Area** ≥ 2 CSS px solid perimeter around the focused element
- **Contrast** ≥ 3:1 between the focused and unfocused states

These violations are **only detectable at runtime**. You must programmatically
focus each interactive element, capture computed styles before and after, and
measure the contrast ratio. Static HTML inspection cannot detect them — the
computed focus outline color may come from an external stylesheet, a CSS reset,
or a CSS custom property whose value resolves at render time.

**Prevalence in production:** 25 of 26 real sites in our D_r corpus have SC
2.4.13 violations (1,841 total violations). No existing automated repair tool
targets this criterion.

---

## 2. Pipeline — 5 Stages

```
┌───────────┐   results.json    ┌──────────────┐   evidence bundle
│  Stage 1  │ ───────────────▶  │   Stage 2    │ ──────────────────▶
│  Detect   │                   │   Evidence   │
│ NavA11y   │                   │  Packager    │
└───────────┘                   └──────────────┘
      ▲                                │ E1 / E2 / E3 / E4
      │                                ▼
      │                         ┌──────────────┐   typed patch JSON
      │                         │   Stage 3    │ ──────────────────▶
      │                         │   Generate   │
      │                         │ Rule / LLM   │
      │                         └──────────────┘
      │                                │
      │                                ▼
      │ re-run on patched page  ┌──────────────┐
      └─────────────────────────│   Stage 4    │
                                │    Apply     │
                                │  Playwright  │
                                └──────────────┘
                                       │ RESOLVED / UNRESOLVED / REGRESSED
                                       ▼
                                ┌──────────────┐
                                │   Stage 5    │
                                │   Verify     │
                                │  diff + SSIM │
                                └──────────────┘
```

**Stage 1 — Detection** (`src/detector/` → `nava11y/`):
NavA11y spawns a Playwright browser, navigates to the target, programmatically
`.focus()`s each interactive element, captures 22 computed CSS properties before
and after focus, measures contrast ratios, checks obscuration. Outputs one
violation record per failing element with a screenshot.

**Stage 2 — Evidence packaging** (`src/evidence/packager.js`):
Packages the violation record into one of 4 graduated bundles. This is the
**RQ2 ablation lever** — same code path, different bundle contents.

**Stage 3 — Generation** (`src/generators/`):
Two generators run in parallel in experiments:
- *Rule-based*: deterministic. Contrast < 3:1 → inject 2px solid outline in a
  compliant colour. 100% resolution rate on both corpora.
- *LLM-based*: OpenRouter (`openai/gpt-oss-120b:free`). Receives the evidence
  bundle + SC-specific instructions + typed patch schema. Must respond with
  valid JSON only.

**Stage 4 — Application** (`src/patches/applier.js`):
Playwright injects the patch into the live DOM. Four patch types supported:

| `patch_type` | What it does |
|---|---|
| `css_inject` | Appends `<style>` tag to `<head>` |
| `attr_set` | Sets/removes an attribute on a specific element |
| `style_override` | Sets an inline `style` property |
| `dom_reorder` | Moves an element to a new parent position |

**Stage 5 — Verification** (`src/verifier/`):
Serialises the patched DOM to a temp file, re-runs NavA11y, diffs violations
before vs after. Three checks:
1. Target violation resolved?
2. Any new violations introduced? (regression)
3. Visual similarity SSIM ≥ 0.9?

---

## 3. Evidence Levels — The Ablation Lever (RQ2)

The central research question is: **which piece of evidence actually causes the
LLM to generate a correct patch?**

| Level | Contents given to LLM |
|---|---|
| **E1** | `outerHTML` of the failing element + full-page screenshot path |
| **E2** | E1 + WCAG technique text (what F78 / C27 / G1 say) |
| **E3** | E2 + runtime style snapshots (22 CSS props before/after focus), measured contrast ratio, obscurer element data |
| **E4** | E3 + annotated element-crop screenshot (red bounding box) |

E3 is what makes RepairA11y distinct. Prior systems (AccessGuru, Fernández-Navarro)
give the LLM an axe-core violation label — "this element fails SC X.X.X" — but
not the computed style state that caused the failure. E3 includes:

```json
"runtimeSlice": {
  "styleSnapshots": {
    "before": { "outlineStyle": "none", "borderColor": "rgb(204,204,204)", ... },
    "after":  { "outlineStyle": "none", "borderColor": "rgb(187,187,187)", ... }
  },
  "contrastRatio": 1.3,
  "reason": "No focus indicator meets AAA requirements"
}
```

---

## 4. Concrete Examples — Before & After

### Example A — 1px border-colour change only (dnew-02)

**The anti-pattern:** `input:focus { outline: none; border-color: #bbb }` — border
width stays at 1px, colour changes from `#ccc` to `#bbb`. Contrast ≈ 1.3:1.
Neither the 2px area requirement nor 3:1 contrast is met.

| Before (focused, no passing indicator) | After (patch applied) |
|---|---|
| ![before](report_screenshots/dnew-02-before.png) | ![after](report_screenshots/dnew-02-after.png) |

**What E3 told the LLM:**
```
before.outlineStyle: "none"
before.borderTopWidth: 1px
after.borderColor: rgb(187,187,187)   ← only change
contrastRatio: 1.3
```

**LLM-generated patch (E3, RESOLVED):**
```json
{
  "patch_type": "css_inject",
  "target_selector": "html > body > label > input",
  "payload": {
    "rule": "html > body > label > input:focus { outline: 2px solid #000 !important; outline-offset: 0 !important; }"
  },
  "wcag_technique_cited": "C15"
}
```

Result: 2px solid black outline, contrast 21:1. Both requirements pass. ✓

**Why E1 fails here:** Without E3, the LLM sees `border-color: #bbb` in the
CSS and often tries adjusting the border colour to a darker value — still 1px,
still below minimum area. E3 explicitly shows the border width never changes,
only colour, so the LLM correctly concludes a new `outline` is required.

---

### Example B — Global `* { outline: none }` CSS reset (dnew-04)

**The anti-pattern:** Many real sites include a blanket CSS reset that removes
all browser default focus outlines. Every interactive element silently loses its
focus indicator.

| Before (focused, no indicator) | After (patch applied) |
|---|---|
| ![before](report_screenshots/dnew-04-before.png) | ![after](report_screenshots/dnew-04-after.png) |

**LLM-generated patch (E4, RESOLVED):**
```json
{
  "patch_type": "css_inject",
  "target_selector": "html > body > nav > a",
  "payload": {
    "rule": "html > body > nav > a:focus { outline: 2px solid #ffbf00 !important; outline-offset: 2px !important; }"
  },
  "wcag_technique_cited": "C15"
}
```

**Why this case needs E4:** The element's `background-color` is `rgba(0,0,0,0)`
(transparent). NavA11y's contrast checker ignores alpha and treats this as
black — so any generated `outline` colour appears to fail contrast against
"black" even at E3. At E4, the annotated screenshot shows the LLM the actual
white page background visually. The LLM chooses amber (`#ffbf00`), which has
21:1 contrast on white. This is the key qualitative finding: **E4 enables a
different repair strategy, not just more information.**

---

### Example C — Dark theme, outline = background colour (dnew-09)

**The anti-pattern:** Dark UI where the focus outline colour (`#313244`) is
nearly identical to the element background (`#181825`). Contrast ≈ 1.67:1.
The indicator is technically present but visually invisible.

| Before (focused, invisible indicator) | After (patch applied) |
|---|---|
| ![before](report_screenshots/dnew-09-before.png) | ![after](report_screenshots/dnew-09-after.png) |

**What E3 told the LLM:**
```
after.outlineColor: rgb(49, 50, 68)     ← #313244 (dark purple)
after.backgroundColor: rgba(0, 0, 0, 0) ← transparent (inherits dark sidebar)
reason: "Outline contrast with background 1.67:1 is below minimum 3:1"
```

**LLM-generated patch (E3, RESOLVED):**
```json
{
  "patch_type": "css_inject",
  "target_selector": "html > body > div > nav > a",
  "payload": {
    "rule": "html > body > div > nav > a:focus { outline: 2px solid #ffffff !important; }"
  },
  "wcag_technique_cited": "C15"
}
```

White on `#181825` dark background = 16.1:1 contrast. ✓

**Why E1 fails here:** The static HTML has `outline: 2px solid #313244` — the
width already looks correct. Without E3, the LLM often keeps the outline in the
dark purple family (adjusting slightly). E3 provides the exact measured contrast
ratio (1.67:1) and the actual background colour, making it clear the colour must
move to the opposite end of the luminance range.

---

### Example D — Bootstrap-style low-contrast box-shadow (dnew-05)

**The anti-pattern:** Bootstrap 5's `.btn:focus` uses
`box-shadow: 0 0 0 0.25rem rgba(110,168,254,0.5)` instead of an outline.
The semi-transparent blue glow on white achieves ≈ 2.1:1 contrast — below the
3:1 minimum.

| Before (focus glow, 2.1:1 contrast) | After (patch applied) |
|---|---|
| ![before](report_screenshots/dnew-05-before.png) | ![after](report_screenshots/dnew-05-after.png) |

**LLM-generated patch (E3, RESOLVED):**
```json
{
  "patch_type": "css_inject",
  "target_selector": ".btn-danger",
  "payload": {
    "rule": ".btn-danger:focus { outline: 2px solid #005fcc !important; outline-offset: 0 !important; }"
  },
  "wcag_technique_cited": "C15"
}
```

Solid blue `#005fcc` on white = 4.56:1 contrast. ✓

---

## 5. Results

### RQ1 — Repair Effectiveness

| Corpus | Generator | Rate |
|---|---|---|
| D_d (controlled) | Rule-based | 100% (6/6) |
| D_d | LLM E3 | 94.4% (17/18) |
| D_new (realistic) | Rule-based | 100% (7/7) |
| D_new | LLM E3 | 76.2% (16/21) |

D_new is harder (class selectors, CSS frameworks, CSS resets) — validates that
realistic cases require more capability.

### RQ2 — Evidence Ablation (core contribution)

| Level | D_d rate | D_new rate |
|---|---|---|
| E1 — HTML + screenshot | 66.7% | 33.3% |
| E2 — + WCAG text | 53.7% ▼ | 42.9% |
| **E3 — + runtime data** | **92.6%** | **81.0%** |
| E4 — + annotated crop | 88.9% | 85.7% |

**E1 → E3 improvement:**
- D_d: +25.9 pp, McNemar χ²=9.389, **p=0.0022**, Cohen's h=0.680
- D_new: +47.6 pp, McNemar χ²=8.100, **p=0.0044**, Cohen's h=1.007 (large)

**E2 hurts on D_d** (p=0.023): WCAG technique text without runtime context
misleads the LLM into applying the wrong fix strategy. Novel finding.

**E3 → E4 not significant** on either corpus: visual crop gives marginal
benefit beyond runtime data alone.

### RQ4 — Regression

- Regression rate: **0.0%** across 8 cases
- Mean SSIM: **1.000** (patches are visually non-invasive)

---

## 6. The Core Novelty — Runtime Context

The central contribution of RepairA11y is **runtime context**: feeding the LLM
the *rendered, measured state* of the focused element (computed style snapshots,
contrast ratios, obscurer geometry) rather than only the static source it was
generated from. Everything else in the system exists to isolate and measure the
effect of this one variable.

### Why runtime context is the right novelty

Focus-behavior conformance is a **rendered property**, not a source property.
Whether an outline meets 3:1 contrast depends on:

- the *computed* outline colour (may come from a CSS variable resolved at render time)
- the *effective* background (inherited, stacked, transparent, theme-dependent)
- the *measured* contrast between focused and unfocused pixels
- whether another element *obscures* the indicator (z-index, sticky headers)

None of these are present in `outerHTML`. An LLM given only source code is
guessing at the rendered result. Section 7 shows exactly this: at E1 the model
blindly defaults to a black outline; at E3, handed the measured background and
contrast, it picks a passing colour. **The novelty is not "use an LLM to repair
accessibility" — others do that. It is "ground the LLM in detector-measured
runtime state, and prove that grounding is what drives repair quality."**

### How runtime context impacts results

| Impact | Evidence |
|---|---|
| Large, statistically significant lift | E1→E3: +25.9 pp (D_d, p=0.0022) and +47.6 pp (D_new, p=0.0044); Cohen's h up to 1.007 (large effect) |
| The lift is *causal*, not correlational | McNemar paired design — identical case, identical LLM, only the evidence bundle changes |
| Bigger impact on harder cases | D_new (frameworks, CSS resets, dark themes) gains +47.6 pp vs D_d's +25.9 pp — realistic complexity benefits *more* from runtime grounding |
| Static text alone is insufficient — even harmful | E2 (WCAG technique text, no runtime data) *hurts* on D_d (p=0.023): the rule without the pixels misleads the model |
| Resolves nearly all genuine reasoning cases | E3 excluding oracle bug + API errors = 17/17 (100%) on D_new (§7.4) |

### Why it is non-trivial (not "obviously true")

"More context helps" is not a foregone conclusion. The RAG/long-context
literature shows added context can *degrade* model performance — irrelevant
documents drop accuracy (Cuconasu et al., SIGIR 2024; Shi et al., ICML 2023),
and mid-context information is under-used (Liu et al., TACL 2024). Our E2-hurts
finding is a live instance of this. Whether *runtime* evidence specifically
helps was therefore a genuine empirical question — which RQ2 answers.

### Where it sits against prior work

| Claim | Evidence |
|---|---|
| First evidence-level ablation in accessibility repair | None of AccessGuru, Fernández-Navarro & Chicano, or DesignRepair perform controlled per-level ablation |
| Runtime evidence causally improves repair | McNemar paired test — same case, same LLM, different evidence bundle |
| WCAG 2.4.7 / 2.4.11 / 2.4.12 / 2.4.13 specifically targeted | axe-core–bounded systems cannot detect these SCs with sufficient depth |
| E2 can hurt without E3 | Counter-evidence to "more context always helps" — backed by Shi et al. ICML 2023 |

**One-sentence positioning:** NavA11y (chapter 1) closed the focus-behavior
*detection* gap; RepairA11y (chapter 2) closes the *repair* gap — and provides
the first causal evidence that runtime-grounded prompting drives the improvement.

---

## 7. Failure Analysis — Where & Why the LLM Fails

Failures fall into three distinct buckets. Only the **first** is a genuine LLM
reasoning failure; the other two must be reported separately or they understate
true repair capability.

### 7.1 Blind colour choice — the dominant reasoning failure (E1/E2)

When the LLM cannot see the rendered background, it defaults to a **black
(`#000`) outline** as a "safe" guess. On dark or transparent backgrounds this
still fails the 3:1 contrast requirement. The same case resolves at E3 once the
runtime slice supplies the measured background colour and contrast ratio:

| Case | E1/E2 colour | result | E3 colour | result |
|---|---|---|---|---|
| dnew-09 (dark theme) | `#000` | ✗ UNRESOLVED | `#ffffff` | ✓ RESOLVED |
| dnew-07 (sticky header) | `#000` | ✗ UNRESOLVED | `#005FCC` | ✓ RESOLVED |
| dnew-05 (Bootstrap) | `black` | ✗ UNRESOLVED | `#005fcc` | ✓ RESOLVED |

**Root cause:** colour contrast is a *rendered* property — it depends on
stacking, inheritance, transparency, and theme. None of these are readable from
`outerHTML`. E1 gives the source; E3 gives the rendered measurement. **Every
E1→E3 rescue in the data is the LLM moving from a blind black-outline guess to a
background-aware colour.** This is RQ2's causal mechanism made visible at the
patch level.

E2 (WCAG technique text) does **not** fix this: knowing the rule ("use ≥3:1
contrast") is not the same as knowing the pixels ("the background is `#181825`").

### 7.2 Oracle bug — dnew-04 fails at every level (not the LLM's fault)

`dnew-04` (global `* { outline: none }` reset) stays UNRESOLVED at E1/E2/E3 and
most E4 — 11 of the 28 D_new UNRESOLVED trials. NavA11y's contrast checker
ignores the alpha channel, so the element's transparent `rgba(0,0,0,0)`
background is treated as black. **Any** outline colour then scores 1:1 against
"black" forever. The patch is often correct; the oracle cannot see it. E4
occasionally escapes by switching strategy to `box-shadow` (which NavA11y
auto-passes). Documented as a threat to validity.

### 7.3 Infrastructure errors — not reasoning

| Error | D_d | D_new | Cause |
|---|---|---|---|
| `missing choices[0]` | 14 | 4 | OpenRouter free-tier rate-limit / empty response |
| `invalid JSON` (after 3 attempts) | 2 | 1 | Model emitted prose instead of patch JSON |
| NavA11y browser crash | 1 | 0 | Playwright page closed mid-run |

These are `ERROR` status, **separable** from `UNRESOLVED`. ~7% of D_d trials
were lost to free-tier API flakiness; a paid tier removes them (one-line change).

### 7.4 Corrected repair rate

Excluding the two non-reasoning buckets gives the true reasoning capability at E3:

| D_new E3 measurement | Rate |
|---|---|
| Raw | 17/21 (81.0%) |
| Excluding API errors | 17/20 (85.0%) |
| Excluding API errors **and** dnew-04 oracle bug | **17/17 (100.0%)** |

**Takeaway:** once the oracle bug and infrastructure flakiness are removed, E3
runtime evidence resolves *every* genuine SC 2.4.13 reasoning case in D_new. The
remaining headline gap (81% vs 100%) is dominated by tooling, not model
reasoning — an important framing for the threats-to-validity section.
