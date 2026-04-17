# RepairA11y — Claude Code Context

## What this repo is

Thesis chapter 2 — automated repair of WCAG 2.4 focus-behavior violations. Follows NavA11y (ENASE 2026, chapter 1), which detects the same violations. NavA11y source is copied into `nava11y/` at this repo root.

**Research claim:** LLM-based repair systems receiving runtime evidence produce better patches than systems receiving only static evidence (HTML + screenshot), for violations observable only at runtime.

**Target SCs:** 2.4.3 · 2.4.7 · 2.4.11 · 2.4.12 · 2.4.13

## NavA11y — how to use it

Copied at `nava11y/`. Edits here are allowed **only for commits prefixed `nava11y:`** and must be cherry-picked to `jaf107/NavA11y` upstream as PRs. Re-sync `nava11y/` from upstream main after each merge to confirm byte-equivalence. Any non-`nava11y:` prefixed change to this directory is a bug.

```bash
# Install (once)
cd nava11y && npm install

# Run on a URL
node nava11y/run-check.js https://example.com

# Run on a local HTML file
node nava11y/run-check.js --file ./path/to/page.html

# Output lands in: nava11y/reports/<sanitized-url>/
#   results.json  — machine-readable violation array
#   index.html    — human-readable report
```

### NavA11y violation record schema (results.json)

Each entry in the JSON array:

**Element-level (2.4.7, 2.4.11, 2.4.12, 2.4.13):**
```json
{
  "result": "FAIL" | "PASS" | "REVIEW",
  "reason": "string",
  "evidence": {
    "failures": ["string"],
    "changes": ["outline-appeared", "..."],
    "measurements": { "outlineWidth": 0, "borderWidths": {...} },
    "obscuredRatio": 0.0,
    "obscuredBy": ["selector-string"]
  },
  "sc": "2.4.13",
  "id": "uuid (FAILs only)",
  "element": {
    "selector": "css-selector",
    "tagName": "button",
    "tabIndex": 0,
    "bbox": { "top": 0, "left": 0, "bottom": 0, "right": 0, "width": 0, "height": 0, "x": 0, "y": 0 },
    "attributes": { "id": null, "class": null, "role": null, "ariaLabel": null, "href": null, "type": null },
    "visibility": { "display": "block", "visibility": "visible", "opacity": 1 }
  },
  "screenshot": "relative-path-or-null",
  "checkType": "element-level"
}
```

**Page-level (2.4.3):**
```json
{
  "result": "FAIL" | "PASS" | "REVIEW",
  "reason": "string",
  "evidence": {
    "violations": [{ "type": "order-divergence", "percentage": "17.8", "threshold": "10.0", "severity": "medium", "reason": "..." }],
    "tabSequence": [{ "selector": "...", "tabIndex": 0, "position": { "top": 0, "left": 0 } }]
  },
  "sc": "2.4.3",
  "id": "uuid",
  "screenshot": "path",
  "violationScreenshots": [{ "selector": "...", "violationType": "...", "screenshot": "path" }],
  "checkType": "page-level"
}
```

### Evidence gaps — what RepairA11y Stage 2 needs but results.json does NOT export

These fields are computed during NavA11y's detection but not written to results.json. RepairA11y's evidence packager must either re-run NavA11y with instrumentation changes, or capture them via a supplementary Playwright pass:

| SC | Missing from results.json | Where computed in NavA11y |
|----|--------------------------|--------------------------|
| 2.4.7 / 2.4.13 | Raw `before` and `after` computed style snapshots (22 CSS props: outlineWidth, outlineStyle, outlineColor, outlineOffset, borderTopWidth, borderTopColor, backgroundColor, boxShadow, color, opacity, transform, visibility, display, textDecoration, textDecorationColor, fontWeight, position, zIndex, transition, filter, clip, clipPath) | `runner.js:439–465` via `__snapshotComputedStyle` |
| 2.4.7 / 2.4.13 | Measured contrast ratio (number) | `focus-heuristics.js` via `getContrastRatio` — present in heuristic output but not in exported evidence |
| 2.4.11 / 2.4.12 | Obscurer element: CSS selector, bounding box, `position` value, `z-index` | `runner.js:465` via `__getObscurationData` — only `obscuredRatio` and `obscuredBy[]` (names) are exported |
| 2.4.3 | Positive tabindex elements with actual tabIndex values | May be partially in violations array — verify |

### NavA11y datasets

- **D_d (controlled):** `nava11y/dataset/focus-behavior-dataset/tests/` — HTML test case files. `tests.json` is a W3C-style benchmark comparison, not NavA11y ground-truth patches.
- **D_r (production):** `nava11y/evaluation/dataset.json` — 27 of 30 Semrush top sites (3 excluded: craigslist IP redirect, doordash bot-detection, makemytrip 403).
- **Pre-run results:** `nava11y/reports/www_qualtrics_com/` — sample report already generated.

## Pipeline (5 stages)

```
Stage 1: Detection    → nava11y/run-check.js → results.json
Stage 2: Evidence     → src/evidence/packager.js → evidence bundle (E1..E4)
Stage 3: Generation   → src/generators/{rule_based,llm_based}/ → typed patch JSON
Stage 4: Application  → src/patches/applier.js → Playwright DOM mutation
Stage 5: Verification → src/verifier/ → re-run NavA11y, SSIM diff
```

### Typed patch schema

```json
{
  "patch_type": "css_inject" | "attr_set" | "dom_reorder" | "style_override",
  "target_selector": "string",
  "payload": {},
  "rationale": "string",
  "wcag_technique_cited": "F78" | "C27" | "G1" | "F44" | null
}
```

### Evidence levels (RQ2 ablation lever — swap in packager.js)

| Level | Contents |
|-------|----------|
| E1 | outerHTML + full-page screenshot |
| E2 | E1 + WCAG technique text (F78/C27/G1/F44) |
| E3 | E2 + per-SC runtime slice (style snapshots, contrast, obscurer data, tab sequence) |
| E4 | E3 + annotated element-crop screenshot |

## LLM clients

- `src/generators/llm_based/client_openrouter.js` — **implement this first**. Free tier only. Check `https://openrouter.ai/models?max_price=0` for strongest current free model supporting JSON output.
- `src/generators/llm_based/client_anthropic.js` — stub, `TODO(future-pr)`
- `src/generators/llm_based/client_openai.js` — stub, `TODO(future-pr)`

**Current budget: $0.** Do not add paid API keys. Upgrade is a one-line change once pipeline is proven.

## Milestones (ordered — do not skip ahead)

1. Build `src/detector/` — thin wrapper that runs `nava11y/run-check.js` as subprocess, parses `results.json` into RepairA11y's typed violation record
2. Hand-author 3 ground-truth patches for D_d: one 2.4.13 case, one 2.4.11 case, one 2.4.3 case — this forces the typed-patch schema to be real before anything else is built
3. Rule-based generator for **SC 2.4.13 only** (`src/generators/rule_based/sc_2_4_13.js`): given FAIL with measured contrast < 3:1, inject `:focus-visible` outline CSS with compliant color. Test on D_d. Target: 100% resolution on 2.4.13 cases.
4. Patch applier + verifier — prove full loop Stage 1→4→5 for SC 2.4.13 before touching LLM
5. LLM generator for SC 2.4.13. Compare vs rule-based on same cases. Begin RQ2 ablation.
6. Only after milestone 5: add remaining 4 SCs.

## Key related work (for positioning)

- **GenA11y (FSE 2025):** 0% recall on SC 2.4.3 and 2.4.7 — explicit motivation for runtime evidence claim
- **AccessGuru (ASSETS 2025):** ~84% violation reduction, axe-core only, no focus-behavior SCs
- **Fernández-Navarro & Chicano (arXiv 2026):** Selenium + LLM, axe-bounded
- **DesignRepair (ICSE 2025):** dual-stream repair, Material Design targets, not WCAG

One-sentence positioning: NavA11y closed the focus-behavior detection gap; RepairA11y closes the repair gap.

## Threats to validity (address in paper)

- Loop structure resembles AccessGuru re-prompting — frame contribution as runtime-grounded prompting, not the loop alone
- D_d authored by same team — use D_r as primary metric
- LLM stochasticity — run each experiment 3×, temperature pinned, report mean ± std
- Oracle overfitting — report both NavA11y pass rate AND manual review rate separately; this is the single biggest reviewer concern

## No agent frameworks

Plain orchestration code only (no LangChain, LangGraph, etc.). The repair loop is `src/loop/repair_loop.js` — just a function calling stages in sequence.
