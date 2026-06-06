# RepairA11y — Plain-Language Guide

A friendly walk through what this project does, how each part works,
and how you use it day-to-day. No prior knowledge of the codebase
assumed.

> **One-sentence summary:** This tool finds keyboard-accessibility
> problems on web pages (specifically four WCAG 2.4 rules about how
> focus indicators look and behave) and tries to fix them
> automatically by writing small CSS or HTML patches.

---

## Table of contents

1. [What problem we're solving (in human terms)](#1-what-problem-were-solving-in-human-terms)
2. [The five stages — what happens when you run it](#2-the-five-stages--what-happens-when-you-run-it)
3. [Two ways to generate fixes: "rules" vs "the AI"](#3-two-ways-to-generate-fixes-rules-vs-the-ai)
4. [The four kinds of patch we can write](#4-the-four-kinds-of-patch-we-can-write)
5. [How we know a patch actually worked (verification)](#5-how-we-know-a-patch-actually-worked-verification)
6. [The big "experiments" (RQ1, RQ2, RQ4) — what they answer](#6-the-big-experiments-rq1-rq2-rq4--what-they-answer)
7. [Everyday commands](#7-everyday-commands)
8. [How to do a manual review (the human-in-the-loop step)](#8-how-to-do-a-manual-review-the-human-in-the-loop-step)
9. [What goes wrong + how to spot it](#9-what-goes-wrong--how-to-spot-it)
10. [Glossary](#10-glossary)

---

## 1. What problem we're solving (in human terms)

Imagine a sighted person using your website with a mouse. They click
on a button and it works. Easy.

Now imagine a keyboard-only user (someone with a motor disability, or
just someone who prefers to keep their hands on the keyboard). They
press **Tab** to move from one interactive thing to the next, then
press **Enter** to activate whatever's currently focused.

For this to work, two things have to be true:

1. **They can see where they are.** When focus lands on a button, the
   button should look different from the buttons next to it —
   typically a visible outline or border change. This is called the
   **focus indicator**.
2. **Nothing covers up the focused element.** If a sticky footer or
   cookie banner is sitting on top of the focused button, the user
   can see *something* is focused (the indicator says so) but can't
   actually see *what* — that's almost as bad as nothing.

WCAG (Web Content Accessibility Guidelines) writes these requirements
as **success criteria (SCs)**:

| SC | Plain name | What it requires |
|---|---|---|
| 2.4.7 | "Focus Visible" | When something has focus, it must be visually obvious. |
| 2.4.11 | "Focus Not Obscured (Minimum)" | The focused element can't be fully hidden by another element. |
| 2.4.12 | "Focus Not Obscured (Enhanced)" | The focused element can't be hidden *at all*, even by 1 pixel. |
| 2.4.13 | "Focus Appearance" | The focus indicator must be at least 2 CSS pixels around the element AND have 3:1 contrast with the unfocused state. |

(We also detect SC 2.4.3 "Focus Order" — out of scope for repair in
this thesis, but the detector still reports it.)

The companion project **NavA11y** (your previous thesis chapter)
detects these violations. **RepairA11y** (this project) takes those
detected violations and tries to write a small code patch that fixes
them, then proves the fix worked.

---

## 2. The five stages — what happens when you run it

Every repair is a five-step pipeline. When you run, say,
`npm run repair:url -- https://example.com`, here's what happens
under the hood:

```
   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
   │  Stage 1    │    │  Stage 2    │    │  Stage 3    │
   │  DETECT     │ ─► │  PACKAGE    │ ─► │  GENERATE   │
   │             │    │  EVIDENCE   │    │  A PATCH    │
   └─────────────┘    └─────────────┘    └─────────────┘
        │                                       │
        ▼                                       ▼
   "NavA11y says button.x          "Here's a small CSS rule that should
    has a 1px outline; need 2px"    bump it to 2px"

   ┌─────────────┐    ┌─────────────┐
   │  Stage 4    │    │  Stage 5    │
   │  APPLY THE  │ ─► │  VERIFY     │
   │  PATCH      │    │  IT WORKED  │
   └─────────────┘    └─────────────┘
        │                   │
        ▼                   ▼
   "Inject the new CSS    "Re-run NavA11y on the patched page.
    into the page DOM"     Is the violation gone? Did we break
                          anything else? Did the page change
                          visually in a weird way?"
```

A short loop wraps Stages 2-5: if the verifier says the patch
didn't work, the loop hands the failure context back to the
generator and asks for another try. Default: up to 3 tries per
violation.

### What's in each stage in the code

| Stage | Code lives in | What you'd read it for |
|---|---|---|
| 1 — Detect | `src/detector/` | How we spawn NavA11y and normalize its output |
| 2 — Evidence | `src/evidence/` | What we tell the LLM about the violation |
| 3 — Generate | `src/generators/rule_based/` and `src/generators/llm_based/` | The rules and the LLM prompts |
| 4 — Apply | `src/patches/` | How we mutate the DOM safely |
| 5 — Verify | `src/verifier/` | How we know it worked |
| Loop | `src/loop/repair_loop.js` | The retry logic that glues it all |

---

## 3. Two ways to generate fixes: "rules" vs "the AI"

We have **two completely different ways** to generate a patch.
Comparing them is the whole point of the thesis.

### Way A — Rule-based (no AI involved)

A regular JavaScript function with a bunch of `if`/`else` branches.
For SC 2.4.13 (focus appearance), the rule-based generator basically
says:

> *"OK NavA11y, you told me the outline contrast is too low.
> Let me look at the colors you measured. I'll do the math
> (WCAG relative-luminance formula) and figure out a darker shade
> that gets to 3:1 contrast. Then I'll emit a `css_inject` patch
> with the new color."*

Pros: predictable, fast, free, easy to understand. The fix is
always traceable to a specific rule.

Cons: it can only handle the patterns we hard-coded. New kind of
violation? We have to write new rules.

### Way B — LLM-based (uses an AI model)

We package up evidence about the violation (the HTML, a screenshot,
the relevant WCAG technique text, the runtime CSS measurements) and
send it to a language model with a prompt that says:

> *"Here's a broken page. Here's the WCAG rule it's failing.
> Here are the exact CSS values we measured. Write me a JSON patch
> that fixes it."*

The LLM responds with a JSON object. We validate it against our
schema, then apply it.

Pros: can handle patterns we never anticipated. Can use context
("this looks like a modal, so the fix should preserve modal
behavior").

Cons: not deterministic (same input → different output each time),
costs tokens, can hallucinate selectors that don't exist.

### The free LLM setup (no credit card)

We use **OpenRouter** — an aggregator that gives free access to
~25 open-source models (DeepSeek, Llama 3.3, Qwen 2.5, GPT-OSS,
etc.).

1. Sign up at https://openrouter.ai/keys (Google/GitHub login)
2. Create a key
3. Paste it into `.env`:
   ```
   OPENROUTER_API_KEY=sk-or-v1-...
   OPENROUTER_MODEL=openai/gpt-oss-120b:free
   ```
4. Done. Any command that uses the LLM (`npm run repair:url --generator llm`,
   `npm run run:rq2`) will pick it up.

---

## 4. The four kinds of patch we can write

Every patch follows a strict schema (`src/schemas/patch.schema.json`)
so the applier knows exactly what to do. There are four `patch_type`
values:

### `css_inject` — add a new CSS rule

```json
{
  "patch_type": "css_inject",
  "target_selector": "button.checkout",
  "payload": {
    "rule": "button.checkout:focus { outline: 2px solid #000 !important; }"
  },
  "rationale": "Original :focus rule had no outline...",
  "wcag_technique_cited": "C27"
}
```

How it applies: we add a `<style>` tag to `<head>` containing the
rule. Undo: remove the `<style>` tag.

This is by far the most common — most focus problems can be fixed
with a CSS rule.

### `style_override` — set an inline `style="..."` property

```json
{
  "patch_type": "style_override",
  "target_selector": "div.modal",
  "payload": {"property": "z-index", "value": "9999"},
  ...
}
```

How it applies: `element.style.zIndex = '9999'`. Undo: restore the
previous inline value.

### `attr_set` — change an HTML attribute

```json
{
  "patch_type": "attr_set",
  "target_selector": "a[tabindex='5']",
  "payload": {"attribute": "tabindex", "value": "0"},
  ...
}
```

How it applies: `element.setAttribute('tabindex', '0')`. Undo:
restore the previous value (or remove the attribute if it wasn't
there).

### `dom_reorder` — move an element to a different parent

Less common. Used for fixing reading-order issues by moving an
element to a different position in the DOM.

### Why `!important`?

You'll see `!important` all over our injected CSS. The reason is
**specificity**: NavA11y reports element selectors as long
descendant chains like `html > body > main > button`, which have
lower CSS specificity than the original page's class-based rules
(`.checkout-button:focus`). Without `!important`, our patch "applies"
but loses to the page's existing CSS and has no visible effect.
`!important` overrides this.

---

## 5. How we know a patch actually worked (verification)

This is where most academic "auto-repair" papers cheat — they
declare success based on whatever rule produced the patch, not
based on an independent check. We don't.

The verifier (`src/verifier/index.js`) does **three independent
checks**:

### Pass 1 — Did the target violation actually go away?

We re-run NavA11y on the patched page. If the violation that was
in the baseline FAIL list is no longer in the post-patch FAIL list
(matched by `sc + selector`), Pass 1 succeeds.

**Why matching by `sc + selector` and not by NavA11y's ID:** NavA11y
generates a new UUID for every run, so ID-matching would always
fail. We use the stable `(SC, element selector)` pair instead.

### Pass 2 — Did we accidentally break something else?

If the post-patch detection contains new FAILs that weren't in the
baseline, we flag a **regression**. Common cause: bumping an
element's z-index above other elements that should be on top of it.

### Pass 3 — Did the page look weird afterward?

We take a full-page screenshot before and after, then compare
pixel-by-pixel (using `pixelmatch`). The output is a similarity
score from 0 (totally different) to 1 (identical).

For focus patches this is usually 1.000 — focus styles only activate
when an element actually has focus, and screenshots are taken with
nothing focused. But if you wrote a patch that changes background
colors or layout, this catches it.

### The four possible verdicts

- **RESOLVED** — target gone, no regressions, similarity OK
- **REGRESSED** — patch introduced new failures (or huge visual change)
- **UNRESOLVED** — patch was applied but the target still fails
- **DECLINED** — generator returned `null` (couldn't propose a fix)

---

## 6. The big "experiments" (RQ1, RQ2, RQ4) — what they answer

These are research-question scripts under `experiments/`. Each
produces a Markdown + JSON report.

### RQ1 — Effectiveness

**Question:** Across all 4 SCs, how often does our system actually
fix the violation?

**Compares:** rule-based vs LLM @ E3 evidence
**Corpus:** D_d (controlled fixtures), optionally D_r (live sites)

Run:
```bash
npm run run:rq1 -- --rule-only         # deterministic, no API key
npm run run:rq1                        # both generators
```

### RQ2 — Evidence ablation (the core thesis claim)

**Question:** Does giving the LLM *runtime* evidence (actual measured
contrast values, obscurer details) lead to better repairs than just
giving it the HTML and a screenshot?

**Compares:** E1 (HTML+screenshot only) vs E2 (+WCAG text) vs E3
(+runtime measurements) vs E4 (+annotated crops)
**Statistics:** McNemar's test (paired binary outcomes) + Cohen's h
(effect size)

Run:
```bash
# Dry test — no API key needed:
npm run run:rq2 -- --dry --runs 1 --seeds 1

# Real:
npm run run:rq2 -- --runs 10    # ~1-2 hours, ~500 API calls
```

### RQ4 — Regression analysis

**Question:** How often does our fix break something else? How
visually invasive are the patches?

**Measures:** regression rate, mean SSIM, mean selector specificity

Run:
```bash
npm run run:rq4
```

Already executed this session — produced **0% regression rate, mean
SSIM 1.000** on the rule-based generator.

---

## 7. Everyday commands

```bash
# Run all unit tests (~30-60s)
npm test

# Fast unit tests only (skip Playwright + integration; <1s)
npm run test:fast

# Walk every D_d ground-truth patch through the full pipeline
npm run smoke:batch1

# Run rule-based generator on every D_d SC 2.4.13 case
npm run smoke:batch2

# Repair every focus violation on any URL or local file
npm run repair:url -- https://your-site.com
npm run repair:url -- ./local-page.html --generator llm --level E3
npm run repair:url -- https://your-site.com --sc 2.4.13 --max 10

# Validate a specific hand-written or generated patch
npm run validate:patch -- https://your-site.com path/to/patch.json

# Generate a full review bundle (HTML + screenshots + checklist) for manual inspection
npm run review -- https://your-site.com --out review-output/my-run

# The three experiments
npm run run:rq1 -- --rule-only
npm run run:rq2 -- --dry --runs 1 --seeds 1
npm run run:rq4
```

---

## 8. How to do a manual review (the human-in-the-loop step)

Even though the verifier checks things automatically, your thesis
needs a **manual oracle** — a real human (you) looking at each
patch and saying "yes this is a good fix" or "no this looks weird".

That's what `npm run review` is for. It produces an inspection
bundle in a folder:

```
review-output/qualtrics-2026-06-03/
├── REVIEW.md               ← your checklist (open this first!)
├── baseline.html           ← VERIFIER's view (scripts stripped — looks basic)
├── baseline-live.html      ← VISUAL REVIEW (scripts kept — open this in browser)
├── baseline.png            ← screenshot of original
├── baseline-focused.png    ← screenshot with target element focused
├── patched.html            ← all patches, verifier's view
├── patched-live.html       ← all patches, visual fidelity (open in browser)
├── patched.png             ← screenshot
├── case-1/
│   ├── patched.html        ← just patch 1, stripped
│   ├── patched-live.html   ← just patch 1, visual fidelity
│   ├── patched.png         ← screenshot
│   ├── patched-focused.png ← screenshot with the target focused (quickest check)
│   └── patch.json          ← the typed patch
├── case-2/ … case-3/ …
└── patches.json            ← machine-readable record
```

**Important:** `baseline.html` and `patched.html` are the **stripped**
versions — scripts removed so NavA11y can re-load them without
timing out. They look basic because they are. For visual review,
always open the `-live.html` files instead — those preserve the
site's real styling.

### The review workflow

1. Open `REVIEW.md` in your editor.
2. For each case in the file:
   - Open `baseline.html` in a browser tab.
   - Open `case-N/patched.html` in another tab.
   - In each tab, press **Tab** repeatedly to walk through every
     focusable element.
   - When you land on the target element (named in REVIEW.md),
     compare what you see:
     - **Baseline:** what (if anything) shows as the focus indicator?
       Maybe a thin outline, a color change, or nothing at all.
     - **Patched:** does the new indicator look correct? Does it have
       good contrast? Does it not cover up other content?
3. Tick the checkboxes in REVIEW.md. Each case has 6 checks plus a
   final accept/revise/reject verdict.
4. Save REVIEW.md. That's your oracle row for this URL.

### What to look for (the human judgment calls)

- **Visual aesthetics** — does the patch look good or does it look
  like an obvious bolt-on? (Both can be "correct" by WCAG; you
  decide which is acceptable.)
- **Side effects** — did anything else on the page change layout,
  spacing, or color? The verifier catches some but not all.
- **Real keyboard usability** — actually tab through the page.
  Does it feel right? Is the focus order sensible?

---

## 9. What goes wrong + how to spot it

### "FAIL: target violation still present after patch"

**Status: UNRESOLVED.** The patch was applied (you can see it in the
patched HTML), but NavA11y still flags the violation.

Common causes:
- **Specificity:** an existing rule on the page overrides our patch.
  Look at the patched HTML and check if our `<style>` tag is actually
  taking effect (use browser DevTools to inspect the element).
- **`:focus-visible` vs `:focus`:** NavA11y simulates focus via JS
  which doesn't always trigger `:focus-visible`. Our generators
  emit `:focus` for this reason; if you're hand-writing a patch,
  use `:focus`.
- **Wrong selector:** the LLM made up a selector that doesn't match
  anything. Check the schema validation didn't catch this (it should).

### "REGRESSED: new failures introduced"

**Status: REGRESSED.** Our patch broke something. Almost always a
z-index change for SC 2.4.11/2.4.12 that pushes the focused element
above stuff it shouldn't be above.

Fix: open `patched.html`, see what new violations appeared, and
either revise the patch to be less aggressive or pick a different
strategy (sticky positioning, scroll-padding, etc.).

### "ERROR: page load failed"

Usually NavA11y choking on a saved snapshot of a heavy page (lots
of `<script src=>` tags trying to load). Our `fetchPageToFile`
strips scripts and iframes, but some sites still have inline scripts
that error.

Workaround: try a simpler page first (`https://example.com` is great
for smoke testing), or use a local HTML file with just the broken
element.

### "DECLINED: generator returned null"

The rule-based generator decided no fix applies (e.g., it doesn't
have a strategy for this evidence shape). Or the LLM explicitly
said it couldn't fix it.

This is actually fine — it means the system knows its own limits.
Add a new strategy or improve the LLM prompt.

---

## 10. Glossary

- **WCAG** — Web Content Accessibility Guidelines. The international
  standard for web accessibility. Currently v2.2.
- **SC** — Success Criterion. A specific WCAG rule with a numeric ID
  like "2.4.13". WCAG has ~80 SCs across A/AA/AAA conformance levels.
- **Focus indicator** — the visual change (outline, border, glow)
  that shows which element has keyboard focus.
- **Tab order** — the sequence keyboard focus moves through when
  pressing Tab. Should follow the natural reading order of the page.
- **D_d** — our **d**emo **d**ataset: 158 hand-crafted HTML
  test fixtures bundled with NavA11y. Used for controlled
  experiments.
- **D_r** — our **d**ataset of **r**eal sites: 27 production websites
  from Semrush's top sites list. Used for real-world validation.
- **D_new** — our **new** hand-curated edge cases (in `datasets/dnew/`),
  released as a reproducibility artifact.
- **Evidence level (E1-E4)** — how much information the LLM gets
  about the violation. E1 is just HTML + screenshot; E4 adds WCAG
  technique text, runtime measurements, and annotated crops.
- **NavA11y** — our previous thesis chapter (a vendored copy in
  `nava11y/`). Does the violation detection that RepairA11y consumes.
- **Patch** — a small, typed JSON object describing exactly one
  change to apply to a page. Has 4 possible `patch_type` values.
- **Verifier** — the component that decides whether a patch actually
  worked. Runs 3 independent checks (target resolved, no regressions,
  visual stability).
- **Repair loop** — the controller that tries up to N patches per
  violation. If the first one doesn't work, it tells the generator
  what failed and asks for another try.
- **SSIM** — Structural Similarity Index. A pixel-comparison metric
  from 0 (totally different images) to 1 (identical). We use it as
  a "did the page change a lot visually?" check.
- **McNemar's test** — a statistical test for paired binary outcomes,
  appropriate for our RQ2 design (same cases evaluated at multiple
  evidence levels).
- **Cohen's h** — a statistical "effect size" measure for the
  difference between two proportions. Useful alongside p-values.

---

## Where to go next

- `WALKTHROUGH.md` — what was implemented in the latest session
- `docs/superpowers/specs/2026-06-02-batch-implementation-design.md` —
  design decisions worth knowing for code review
- `CLAUDE.md` — project conventions and constraints
- `IMPLEMENTATION_ORDER.md` — the original issue-tracker order
- `PIPELINE_DESIGN.md` (if present) — the original architectural sketch

Have fun. The best way to learn this codebase is to pick one URL,
run `npm run review -- <url>`, and walk through `REVIEW.md`. You'll
see every part of the system in action.
