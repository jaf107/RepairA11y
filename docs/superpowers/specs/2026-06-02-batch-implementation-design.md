# Design Spec — Batched Implementation of RepairA11y Stages 2-5

**Date:** 2026-06-02
**Status:** Implemented (this session). See `WALKTHROUGH.md` for runbook.
**Plan:** `/Users/abujafar.saifullah/.claude/plans/okay-let-s-plan-the-zany-marshmallow.md`

## Context

Thesis chapter 2 follow-up to NavA11y (chapter 1). NavA11y detects WCAG 2.4
focus-behavior violations; RepairA11y proposes patches that resolve them. The
core research claim is that LLM repair systems receiving runtime evidence
outperform systems receiving only static evidence (E1/E2 vs E3/E4 ablation).

Before this session, the detector wrapper (Stage 1), patch schema, and 3
hand-authored ground-truth patches existed. The remaining 5 stages (evidence,
generation, application, verification, orchestration) plus the experiment
runners were stubs. The user asked to "finish everything" in one session.

## Decisions

### 1. Use Playwright ElementHandles for patch undo

**Why:** The naive approach (re-querying by selector during undo) fails when
the patch itself changes attributes the selector depends on (e.g.,
`a[tabindex='5']` after we set tabindex to "0"). ElementHandles bind to the
DOM node, not the selector, and survive attribute mutations.

**How it applies:** `src/patches/applier.js` — all 4 handlers (attr_set,
style_override, dom_reorder, and css_inject through its style-tag id)
capture a stable reference once and reuse it for undo.

### 2. Verifier matches violations by `(sc, selector)`, not NavA11y UUID

**Why:** NavA11y reissues UUIDs on every run. Matching by UUID makes EVERY
violation look like a "resolved + new failure" pair after re-detection.

**How it applies:** `src/verifier/diff.js`. The verifier accepts both
`targetId` (legacy/back-compat) and `targetSc + targetSelector` (canonical)
in `verify({...})`. The loop passes the canonical pair.

### 3. CSS patches use `!important`

**Why:** NavA11y's selector for most fixtures is a descendant chain like
`html > body > main > button` (specificity 0,0,0,4). The fixture's own CSS
uses class selectors (`button.aaa-outline:focus`, specificity 0,0,2,1) which
beat injected rules without `!important`. Patches that "apply" but lose
specificity are invisible to NavA11y on re-detection.

**How it applies:** All rule-based generator output includes `!important`
on outline-* declarations.

### 4. Rule-based generators emit `:focus`, not `:focus-visible`

**Why:** NavA11y simulates focus via JavaScript `element.focus()`, which
doesn't reliably activate `:focus-visible`. `:focus` is the superset that
always matches.

**How it applies:** All four `src/generators/rule_based/sc_*.js` modules.

### 5. SC 2.4.13 generator has a "catch-all" branch (inject explicit outline)

**Why:** D_d fixtures fail SC 2.4.13 via different mechanisms (insufficient
outline contrast, insufficient outline width, insufficient border-change
contrast, insufficient background-change contrast). A pure
"adjust-outline-color" generator misses the border/background variants.
Universal fix: inject an explicit `outline: 2px solid <high-contrast>` —
this is technique C27 (Adding a visible focus indicator).

**How it applies:** `src/generators/rule_based/sc_2_4_13.js`, branch D.
Result: 4/4 D_d resolution.

### 6. Evidence packager is monotonic-additive (E1 ⊂ E2 ⊂ E3 ⊂ E4)

**Why:** RQ2 ablation requires each level to be a strict superset of the
previous so any difference in LLM behavior can be attributed to the *added*
information. Tested by `bundle size is monotonic E1 < E2 < E3` assertion.

**How it applies:** `src/evidence/packager.js` builds the bundle in passes,
adding fields conditionally.

### 7. McNemar's test for RQ2 (paired binary, same case set)

**Why:** Each evidence level is evaluated on the same set of (case, seed,
run) triples. Two-sample tests like Fisher's exact assume independence;
McNemar is the correct test for paired binary outcomes. Cohen's h provides
the effect size needed to interpret p-values from small N.

**How it applies:** `experiments/_common/stats.js`. Pure JavaScript
implementation (Abramowitz & Stegun erfc approximation for chi-square
survival at ν=1) — no external stats library.

### 8. Experiment runners use a fixed-output dry mode

**Why:** Validating runner correctness shouldn't require API key or
network. The `--dry` flag swaps the LLM client for a generator that returns
a generic outline-injection patch, exercising every code path (evidence
packaging, application, verification, statistical analysis) without LLM
calls. This caught two real bugs (the UUID matching issue and the CSS
specificity issue) before any token was spent.

**How it applies:** All three RQ runners accept `--dry`.

### 9. SC 2.4.3 dropped, RQ3 and RQ5 deferred (out of scope)

**Why:** April 2026 project decisions (memory:
project_debate_decisions_2026_04.md). SC 2.4.3 is structurally different
from focus-behavior SCs (DOM reorder, not styling). RQ3/RQ5 are nice-to-haves
that extend the thesis but aren't load-bearing for the core claim.

**How it applies:** Issues #17, #19, #21 closed with explanatory comments
this session.

## Things deliberately not built

- **Real LLM API smoke test.** First real call needs your key. The
  client+generator are unit-tested with mocks.
- **D_r runner for live URLs.** The RQ1 `--dr` path detects each site but
  can't serialize a patched copy of a remote page (the applier expects a
  local HTML file the verifier can re-feed to NavA11y). Either build a
  local-mirror step or run NavA11y against the live page after patching
  via Playwright in the same browser session.
- **Resumable experiment state.** RQ2 with 10 runs × 4 levels × 3 seeds ×
  4 cases ≈ 480 LLM calls, ~1-2 hours wall-clock. If the runner dies
  mid-flight it has to start over. Add per-trial checkpointing if you
  expect to run it repeatedly.
- **Manual oracle UI.** WALKTHROUGH.md describes the workflow; the actual
  review (you accept/reject each generated patch) is a human task.

## Verification

- `npm test` — 124/124 tests pass.
- `npm run smoke:batch1` — 3/3 ground-truth patches RESOLVED end-to-end.
- `npm run smoke:batch2` — 4/4 D_d SC 2.4.13 cases RESOLVED (rule-based).
- `npm run run:rq4` — runs deterministically; 0% regression rate, mean
  SSIM 1.000.
- `npm run run:rq1 -- --rule-only` — 40% overall (4/10), 100% on SC 2.4.13.
- `npm run run:rq2 -- --dry --runs 2 --seeds 1,2` — 64 trials complete in
  ~15 min, produces correctly-formatted JSON + Markdown.
