# RepairA11y — Pipeline Design (Deep Dive)

**Scope:** SC 2.4.7 · 2.4.11 · 2.4.12 · 2.4.13  
**SC 2.4.3 status:** Deferred. Tab-order repair (DOM reorder) is fundamentally different from CSS-class repair. Lumping it in weakens narrative. Revisit after core paper results.

> Literature justifications for each design decision are inline below.  
> Full citation clusters: see [LITERATURE_REVIEW.md](LITERATURE_REVIEW.md)

---

## End-to-End Data Flow

```
Input: URL or local HTML file
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│ Stage 1 — Detection                                     │
│  NavA11y subprocess → results.json                      │
│  normalize → typed violation records                    │
└──────────────────────┬──────────────────────────────────┘
                       │ ViolationRecord[]
                       ▼
┌─────────────────────────────────────────────────────────┐
│ Stage 2 — Evidence Packaging                            │
│  violation + NavA11y exports → EvidenceBundle{E1..E4}  │
└──────────────────────┬──────────────────────────────────┘
                       │ EvidenceBundle
                       ▼
┌─────────────────────────────────────────────────────────┐
│ Stage 3 — Patch Generation                              │
│  ┌──────────────────┐  ┌───────────────────────────┐   │
│  │ Rule-based       │  │ LLM-based (OpenRouter)    │   │
│  │ SC 2.4.13 only   │  │ all 4 SCs                 │   │
│  └──────────────────┘  └───────────────────────────┘   │
└──────────────────────┬──────────────────────────────────┘
                       │ PatchRecord (typed JSON)
                       ▼
┌─────────────────────────────────────────────────────────┐
│ Stage 4 — Patch Application                             │
│  D_d: modify HTML file on disk                          │
│  D_r: Playwright DOM mutation (live page)               │
└──────────────────────┬──────────────────────────────────┘
                       │ patched page / file
                       ▼
┌─────────────────────────────────────────────────────────┐
│ Stage 5 — Verification                                  │
│  re-run NavA11y → resolution + regression + SSIM        │
└─────────────────────────────────────────────────────────┘
                       │
                       ▼
              ExperimentResult record
```

---

## Stage 1 — Detection

### Responsibility
Spawn NavA11y as subprocess, parse `results.json`, return normalized violation records.

### Inputs / Outputs

```
Input:  { url?: string, htmlFile?: string }
Output: {
  violations: ViolationRecord[],
  reportDir: string,
  resultsPath: string,
  inputUrl: string,
  stdout: string,
  stderr: string
}
```

### ViolationRecord schema

```typescript
{
  id: string,           // UUID from NavA11y (FAILs) or synthesized "page:<sc>" (page-level)
  sc: "2.4.7" | "2.4.11" | "2.4.12" | "2.4.13",
  result: "FAIL" | "PASS" | "REVIEW",
  checkType: "element-level" | "page-level",
  reason: string,
  evidence: object,     // passthrough — Track B fields land here verbatim
  element: {
    selector: string,
    tagName: string,
    tabIndex: number,
    bbox: { top, left, bottom, right, width, height, x, y },
    attributes: { id, class, role, ariaLabel, href, type },
    visibility: { display, visibility, opacity }
  } | null,
  screenshot: string | null,
  raw: object           // original record, for forward-compat
}
```

### Design decisions

**Why subprocess, not library import?**  
NavA11y runs Playwright internally. Importing it as a library would put two Playwright instances in the same Node process — event loop conflicts and resource contention. Subprocess isolates Playwright lifecycle. Also lets NavA11y upgrade independently.

**Why normalize at all?**  
NavA11y's schema can grow with upstream PRs. Normalization gives downstream stages a stable contract. Unknown fields are preserved under `raw`, not silently dropped.

**Error cases to handle:**
- NavA11y timeout (large site) → `DetectorError` with stdout/stderr
- NavA11y exits non-zero → `DetectorError`
- `results.json` missing (NavA11y crash) → `DetectorError`
- `results.json` invalid JSON → `DetectorError`
- Record with unknown SC → skip with warning, do not crash pipeline

### Filtering for repair pipeline

Stage 1 returns ALL results (PASS, FAIL, REVIEW). The repair loop operates only on `result === "FAIL"`. PASS records are kept for pre/post comparison in Stage 5.

---

## Stage 2 — Evidence Packaging

### Responsibility
Transform a `ViolationRecord` into an `EvidenceBundle` at a specified level. The level is the experimental independent variable for RQ2.

### Evidence levels

| Level | Contents |
|-------|----------|
| E1 | `element.outerHTML` + full-page screenshot (base64) |
| E2 | E1 + WCAG technique text (see table below) |
| E3 | E2 + per-SC runtime slice (see per-SC breakdown) |
| E4 | E3 + annotated element-crop screenshot |

### WCAG techniques per SC

| SC | Technique | Text summary included in E2+ |
|----|-----------|------------------------------|
| 2.4.7 | F78 | "Failure: styling element outlines and borders in a way that removes or renders non-visible the visual focus indicator" |
| 2.4.11 | F110 | "Failure: the focus indicator is entirely hidden by author-created content" |
| 2.4.12 | C40 | "Creating a two-color focus indicator to ensure sufficient luminance contrast with all components" |
| 2.4.13 | C40 + F78 | Focus appearance: area ≥ perimeter×2px CSS pixels, contrast ratio ≥ 3:1 |

### Per-SC runtime slice (E3 addition)

#### SC 2.4.7 — Focus Visible

```
evidence.styleSnapshots.before   → 22 CSS props before focus
evidence.styleSnapshots.after    → 22 CSS props after focus
evidence.measurements.outlineWidth (px)
evidence.changes[]               → ["outline-appeared", ...]
contrast_ratio: <computed>       → see contrast computation below
```

Key question: did any visible focus indicator appear at all? If `outlineWidth.after === "0px"` and no border changed → "no focus indicator" sub-type. If indicator exists but invisible → "low contrast" sub-type.

#### SC 2.4.13 — Focus Appearance

All of 2.4.7 runtime slice, plus:

```
outline_area: outlineWidth × perimeter_px   → must be ≥ perimeter × 2
outline_offset: outlineOffset.after (px)
border_widths: { top, right, bottom, left }  → for border-based indicators
```

WCAG 2.4.13 has two sub-checks: (1) minimum area, (2) minimum contrast. The runtime slice exposes both.

#### SC 2.4.11 — Focus Not Obscured (Minimum)

```
evidence.obscurers[]: [
  {
    selector: string,
    bbox: { top, left, bottom, right, width, height },
    position: "fixed" | "sticky" | "absolute" | "relative",
    zIndex: string
  }
]
evidence.obscuredRatio: number   → fraction of element hidden
```

SC 2.4.11 threshold: any obscuration that completely hides the focus indicator = FAIL. "Minimum" level means partial obscuration is allowed.

#### SC 2.4.12 — Focus Not Obscured (Enhanced)

Same data as 2.4.11. Stricter threshold: **any** obscuration = FAIL (not just complete hiding). The distinction is in the violation threshold, not the evidence shape.

### Contrast ratio computation

NavA11y computes contrast internally but does not currently export the number. RepairA11y re-derives it:

```
1. Extract outlineColor from styleSnapshots.after (CSS color value)
2. Extract backgroundColor from styleSnapshots.after
3. Parse both to [R, G, B] (handle: hex #RRGGBB, rgb(), rgba(), named colors)
4. Compute relative luminance:
   For each channel c in [R/255, G/255, B/255]:
     if c <= 0.04045: c / 12.92
     else: ((c + 0.055) / 1.055) ^ 2.4
   L = 0.2126*R + 0.7152*G + 0.0722*B
5. contrast = (L_lighter + 0.05) / (L_darker + 0.05)
```

This is the WCAG 2.1 relative luminance formula. Independent computation protects against NavA11y's internal calculation having edge-case bugs (e.g., alpha compositing).

**Edge case: transparent outline.** If `outlineColor` is `transparent` or `rgba(*,*,*,0)`, contrast = 0. This is the "no focus indicator" case, not "low contrast". Packager flags sub-type accordingly so generator picks the right patch template.

### Screenshot annotation for E4

```
1. Load full-page screenshot (PNG, from violation record)
2. Draw red rectangle at element.bbox (2px stroke)
3. Label: "SC X.X.X — <reason>" above bbox
4. Crop: element bbox + 40px padding all sides
5. Encode as base64 for LLM prompt
```

Purpose: gives LLM a visual anchor for which element is violating. Especially useful for 2.4.11/2.4.12 where the obscuring element is visible in the crop.

### EvidenceBundle schema

```typescript
{
  level: "E1" | "E2" | "E3" | "E4",
  sc: string,
  violationId: string,
  element: {
    outerHTML: string,
    selector: string,
    bbox: object
  },
  screenshot: {
    fullPage: string | null,           // base64 PNG
    annotatedCrop: string | null       // E4 only
  },
  wcagTechnique: {                     // E2+ only
    code: string,
    summary: string,
    url: string
  } | null,
  runtimeSlice: object | null          // E3+ only, SC-specific shape above
}
```

---

## Stage 3 — Patch Generation

### Output schema (all generators)

```typescript
{
  patch_type: "css_inject" | "attr_set" | "dom_reorder" | "style_override",
  target_selector: string,
  payload: object,    // shape depends on patch_type — see below
  rationale: string,
  wcag_technique_cited: "F78" | "C27" | "G1" | "F44" | null
}
```

### Payload shapes per patch_type

```
css_inject:     { rule: "button:focus-visible { outline: 2px solid #767676; }" }
attr_set:       { attribute: "tabindex", value: "0" }
style_override: { property: "outline-color", value: "#767676" }
dom_reorder:    { insert_before_selector: "#main-nav" }
```

---

### Rule-based generator — SC 2.4.13

**When to use:** violation where contrast ratio < 3:1 AND an outline/border exists (non-zero width). Deterministic, no LLM.

**Algorithm:**

```
Input: ViolationRecord + EvidenceBundle (any level, uses runtimeSlice)

1. Read outlineColor (CSS value) from runtimeSlice.styleSnapshots.after
2. Read backgroundColor from same
3. Compute current contrast ratio (formula above)

4. If contrast >= 3.0: log warning "rule-based called on passing case", return null

5. Parse outlineColor → HSL(h, s, l)
6. Binary search on L:
   - try L = 0 (black)
   - try L = 1 (white) 
   - if black passes (contrast >= 3.0) → target = darker direction
   - if white passes → target = lighter direction
   - binary search 10 iterations for minimal L adjustment that passes
7. Reconstruct color: HSL → hex

8. Emit css_inject patch:
   target_selector: element.selector + ":focus-visible"
   payload.rule: `${selector}:focus-visible { outline-color: ${newHex} !important; }`
   rationale: "Adjusted outline-color from ${oldContrast}:1 to ${newContrast}:1 (threshold: 3:1)"
   wcag_technique_cited: "C40"
```

**Edge cases:**

| Case | Handling |
|------|----------|
| `outlineColor` transparent | Not a contrast case — return null, let LLM handle |
| `outlineWidth` = 0px | No outline exists — return null, LLM must add indicator |
| Background is gradient/image | Cannot compute contrast — return null |
| Both colors near mid-gray | Adjust toward black or white based on which needs less change |

**Why `:focus-visible` not `:focus`?**  
`:focus` triggers on mouse click too. `:focus-visible` matches keyboard focus only (user-agent heuristic). WCAG 2.4.13 targets keyboard focus appearance. Using `:focus` would patch correctly but affect more interactions than necessary — lower invasiveness.

---

### LLM-based generator

**Architecture: one shared generator, SC-specific prompt templates.**

#### System prompt

```
You are a WCAG 2.2 accessibility engineer. You generate minimal CSS or HTML 
attribute patches to resolve a specific focus-behavior violation. 

Output ONLY valid JSON matching this schema:
{
  "patch_type": "css_inject" | "attr_set" | "style_override",
  "target_selector": "<CSS selector>",
  "payload": { ... },
  "rationale": "<one sentence>",
  "wcag_technique_cited": "<code or null>"
}

Rules:
- Minimal patch. Do not change anything unrelated to the violation.
- Prefer :focus-visible over :focus for outline changes.
- Prefer CSS (css_inject) over inline styles (style_override).
- Do not use wildcards (*) in selectors unless unavoidable.
- If you cannot generate a valid patch, output: {"patch_type": null, "reason": "..."}
```

#### User prompt structure (E3 example for SC 2.4.13)

```
VIOLATION: SC 2.4.13 (Focus Appearance)
ELEMENT SELECTOR: button.submit-btn
ELEMENT HTML:
<button class="submit-btn" type="submit">Submit</button>

WCAG TECHNIQUE: C40
"Creating a two-color focus indicator to ensure sufficient luminance contrast"

RUNTIME EVIDENCE:
Style BEFORE focus:
  outline: none
  background-color: #ffffff

Style AFTER focus:
  outline: 2px solid #999999
  outline-offset: 2px
  background-color: #ffffff

Contrast ratio: 2.85:1  (required: ≥ 3:1)

SCREENSHOT: [base64 annotated crop]

Generate a patch to resolve this violation.
```

#### Model configuration

```
model:       best free model on openrouter.ai/models?max_price=0
             (benchmark 2-3 candidates on D_d first, pick highest resolution rate)
temperature: 0.0  (reproducibility — LLM stochasticity is a threat to validity)
max_tokens:  512  (patch JSON is small)
json_mode:   enabled if model supports it
```

#### Response handling

```
1. Parse response as JSON
2. If parse fails: retry (max 2 attempts), add "return ONLY valid JSON" to prompt
3. If 3 failures: record as UNRESOLVED, log prompt + response
4. If patch_type === null: record as UNRESOLVABLE (LLM declined)
5. Validate against patch.schema.json → reject invalid shapes
6. Return PatchRecord
```

#### Reproducibility note

Free OpenRouter models can be deprecated or updated silently. For paper: record model name, OpenRouter model version string, and date of each experiment run. If model disappears before paper submission, re-run on closest equivalent model and report both.

---

## Stage 4 — Patch Application

### Two modes

#### D_d mode — local HTML files

NavA11y's controlled dataset files are static HTML on disk. Applier modifies the file directly.

```
css_inject:
  Parse HTML (node/htmlparser2 or similar)
  If <head> missing → create
  Append <style>\n${payload.rule}\n</style> to <head>
  Write back to file

attr_set:
  Parse HTML
  Find element by target_selector (CSS selector → first match)
  Set/remove attribute per payload.{attribute, value}
  Write back

style_override:
  Parse HTML
  Find element
  Read existing style="" attribute
  Set/replace property in inline style string
  Write back

dom_reorder:
  Parse HTML
  Find element by target_selector
  Find target position by payload.insert_before_selector
  Move element
  Write back
```

**Reversibility:** Before modifying, copy original to `<file>.original.html`. Verifier can diff or restore.

#### D_r mode — live websites

NavA11y runs its own Playwright instance as a subprocess. You cannot inject CSS into a separate process's browser from outside.

**Current approach (pragmatic for paper):**

```
1. RepairA11y launches its own Playwright page
2. Navigate to URL
3. Apply patch via page.evaluate() or page.addStyleTag()
4. Capture page.content() → full HTML including computed state
5. Save to temp file
6. Run NavA11y with --file temp-patched.html
7. Record results
```

**Known limitation:** Page content capture loses external stylesheets (CSS files referenced by <link>). NavA11y on the snapshot may produce different results than NavA11y on the live URL.

**Mitigation:** For D_r, save pre-patch snapshot too (NavA11y on live URL vs NavA11y on pre-patch snapshot). If these differ significantly, flag the site as "snapshot-unreliable" and exclude from D_r results.

**Full solution (future / Option A):** Add `--pre-patch <script.js>` flag to NavA11y. Script runs `page.evaluate()` before NavA11y's focus checks. Requires a NavA11y upstream PR. Cleanest approach — NavA11y verification runs in the live browser context with patch applied.

**Decision for supervisor:** Accept snapshot approach for paper with documented limitation, OR invest in NavA11y --pre-patch PR before experiments. The PR is ~50 lines of change in `nava11y/run-check.js`.

---

## Stage 5 — Verification

### Three-pass verification

#### Pass 1 — Target resolution

Re-run NavA11y on patched page/file. Compare against pre-patch baseline.

```
For each violation v that was patched:
  POST-PATCH: run NavA11y → get new results
  
  RESOLVED:   v.id present in pre-patch FAILs, absent (PASS) in post-patch
  UNRESOLVED: v.id still FAIL in post-patch
  ERRORED:    NavA11y crash or timeout on patched page
```

#### Pass 2 — Regression detection

```
For all violations in post-patch results:
  If violation.id NOT in pre-patch violation set AND result === "FAIL":
    → NEW REGRESSION
  
regression_rate = new_fails / total_passes_before_patch
```

Regressions matter because:
- `css_inject` with broad selector (e.g., `a:focus-visible`) can affect many elements
- `style_override` with `!important` can break specificity cascade elsewhere

#### Pass 3 — Visual stability (SSIM)

Compare full-page screenshots before and after patching.

```
ssim_score = pixelmatch(pre_screenshot, post_screenshot)
threshold:   0.95  (conservative)
```

**Important caveat for SC 2.4.7 and 2.4.13:** These patches intentionally add a visible focus indicator. SSIM on focused state will differ. Solution: take SSIM on **unfocused** state screenshots only. Focus-state visual change is expected and desired — not a regression.

For SC 2.4.11/2.4.12: the patch changes z-index. Unfocused screenshots should be identical (z-index only affects stacking during interaction). SSIM check is meaningful here.

---

## Iterative Repair Loop (RQ3)

```
function repairLoop(violation, evidenceLevel, maxIter = 5):
  history = []
  
  for iter in 1..maxIter:
    context = buildPromptContext(violation, evidenceLevel, history)
    patch = generate(context)
    
    if patch is null:
      break  // LLM declined, unresolvable
    
    apply(patch)
    result = verify()
    history.push({ patch, result })
    
    if result.resolved and not result.regressed:
      return SUCCESS(iter, patch)
    
    if result.regressed:
      rollback(patch)
      history.last.note = "REGRESSED: rolled back"
      // next iteration adds regression context to prompt
    
    if iter == maxIter:
      return FAILURE(history)
  
  return FAILURE(history)
```

**Regression context added to next prompt:**
```
PREVIOUS ATTEMPT FAILED:
Patch applied: { patch_type: "css_inject", payload: { rule: "a:focus-visible { ... }" } }
Result: introduced 3 new violations on other elements (over-broad selector).
Avoid selectors that match more than the target element.
```

**RQ3 design:** Run loop with maxIter ∈ {1, 3, 5}. Plot marginal resolution gain per added iteration. Hypothesis: most gains in iteration 1–2, diminishing returns after 3.

---

## Experimental Matrix

```
Corpus = all FAIL records for {2.4.7, 2.4.11, 2.4.12, 2.4.13} from D_d + D_r

For each violation v in corpus:

  [RQ1 — Effectiveness]
  rule_based_result = run rule-based generator (SC 2.4.13 only, else N/A)
  llm_e3_result     = run LLM @ E3, maxIter=1 (single-shot)

  [RQ2 — Evidence Ablation]  (D_d subset, SC 2.4.13 focus)
  for level in {E1, E2, E3, E4}:
    for seed in {1, 2, 3}:        // 3 independent LLM runs, temp=0 but API can vary
      llm_result = run LLM @ level, maxIter=1

  [RQ3 — Loop Iterations]  (D_r subset, E3 only)
  for maxIter in {1, 3, 5}:
    loop_result = run repairLoop @ E3

  [RQ4 — Regression]  (reuse RQ1 patches)
  regression_result = pass2 + pass3 from RQ1 verification

Statistical test (RQ2): McNemar's test on E1 vs E3 (paired binary outcomes, same violations)
Effect size: Cohen's h
```

---

## Metrics Summary

| Metric | Formula | Answers |
|--------|---------|---------|
| Resolution Rate | resolved / total_FAILs | RQ1, RQ2, RQ3 |
| Per-SC Resolution Rate | resolved_sc / total_FAILs_sc | RQ1 breakdown |
| Regression Rate | new_FAILs / total_passing_elements | RQ4 |
| Visual Stability | mean SSIM (unfocused state) | RQ4 |
| Patch Invasiveness | selector specificity score + CSS rule scope | RQ1 quality |
| Human Accept Rate | accepted / sample_size (N≈20 devs, 10% sample) | RQ5 / oracle validation |
| Mean Iterations to Resolve | sum(iter_at_resolution) / resolved | RQ3 |
| Unresolvable Rate | llm_declined / total_FAILs | RQ1 characterization |

---

## Open Questions — Supervisor Input Required

| # | Question | Options | Implication |
|---|----------|---------|-------------|
| 1 | D_r verification approach | Snapshot (pragmatic) vs NavA11y --pre-patch PR (rigorous) | Snapshot: faster but acknowledged limitation. PR: clean but adds 3–4 weeks |
| 2 | LLM model reproducibility | Free OpenRouter (may disappear) vs one paid model with versioned API | Free: $0 budget constraint. Paid: one-line change, ~$10–20 for full experiment |
| 3 | SSIM for focus-change patches | Skip for 2.4.7/2.4.13 (expected visual change) or flag differently | Define "regression" more carefully — visual change IS the point for focus SCs |
| 4 | Rule-based scope | 2.4.13 only vs also 2.4.11/2.4.12 (raise z-index above obscurer) | z-index changes have side effects (can break other stacking contexts) — risky baseline |
| 5 | Human review sample size | 10% of resolved cases vs fixed N=50 | Depends on corpus size — if D_r yields 200 resolved patches, 10% = 20 (plausible) |
| 6 | RQ3 (loop iterations) scope | Include in paper vs future work | Adds 2–3 weeks experiment time. AccessGuru comparison angle makes it worth it |
| 7 | SC 2.4.3 (tab order) | Deferred vs dropped permanently | Tab-order repair = dom_reorder, riskier, harder to verify. Dropping = tighter paper |

---

## Positioning Against Prior Work

| System | Coverage | Evidence | Gap filled by RepairA11y |
|--------|----------|----------|--------------------------|
| GenA11y (FSE 2025) | axe-core SCs | Static HTML | 0% recall on 2.4.7 — no runtime evidence |
| AccessGuru (ASSETS 2025) | axe-core SCs | Static | Focus-behavior SCs absent entirely |
| DesignRepair (ICSE 2025) | Material Design | Dual-stream screenshots | Not WCAG, not focus behavior |
| Fernández-Navarro & Chicano (2026) | axe-core SCs | Selenium runtime | Focus SCs not covered, no evidence ablation |

**One-sentence claim:**  
> NavA11y closed the focus-behavior detection gap; RepairA11y closes the repair gap — and proves that runtime evidence is the key ingredient prior systems lacked.

---

## Threats to Validity

| Threat | Mitigation |
|--------|-----------|
| D_d authored by same team as NavA11y | Use D_r as primary metric; report D_d separately as "controlled" |
| NavA11y oracle overfitting | Human review pass (RQ5) reported side-by-side with NavA11y pass rate |
| LLM stochasticity | 3 runs per condition, temperature=0, mean ± std reported |
| LLM model change (free tier) | Record model version + date; re-run on replacement if needed |
| Snapshot approach for D_r | Report "snapshot-reliability" metric per site; exclude unreliable sites |
| AccessGuru loop similarity | Frame as runtime-grounded prompting, not the loop structure itself |
| Contrast recomputation circularity | Both NavA11y (detect) and RepairA11y (evidence) use WCAG 2.1 formula — same spec, not circular |

---

## Design Decisions — Literature Justification

Each major design choice below maps to citations in [LITERATURE_REVIEW.md](LITERATURE_REVIEW.md).

| Decision | Justification | Literature Cluster |
| -------- | ------------- | ------------------ |
| Automate repair (don't stop at detection) | 95.9% of sites fail WCAG; manual repair not scalable | Cluster 1 — WebAIM Million 2024 |
| Target SC 2.4.7/2.4.11/2.4.12/2.4.13 | No prior repair tool covers these SCs; axe-core cannot detect them | Cluster 2 — Alsaeedi & Joy 2020; Cluster 3 — AccessGuru, GenA11y |
| Use LLM generator (not rule-based only) | Rule-based handles formulaic cases; LLMs handle varied, context-dependent repairs | Cluster 4 — Xia et al. 2023 survey; ChatRepair |
| Four evidence levels E1–E4 (RQ2 ablation) | Context quality is independent variable in LLM repair quality | Cluster 5 — Kang et al. ICSE 2023; Nashid et al. CEDAR |
| Runtime evidence (E3/E4) specifically | Focus violations are computed-style problems — not recoverable from static HTML | Cluster 6 — Ball 1999; GenA11y 0% recall (Cluster 3) |
| Iterative repair loop (RQ3) | Conversational/iterative LLM repair outperforms single-shot | Cluster 4 — ChatRepair ISSTA 2024 |
| Human review oracle (RQ5) | NavA11y pass rate alone is insufficient — oracle overfitting risk | Cluster 3 — AccessGuru re-prompting similarity threat |
| Free LLM via OpenRouter | $0 budget; one-line swap to paid model once pipeline proven | Practical constraint — RepairAgent cost model (Cluster 4) |
| Rule-based baseline for SC 2.4.13 | Establishes ceiling for well-structured cases; enables RQ3 rule vs LLM comparison | Standard APR baseline practice — Cluster 4 |
| NavA11y as Stage 1 (not axe-core) | axe-core misses all 4 target SCs; NavA11y is the only runtime detector | Cluster 2 — NavA11y ENASE 2026 |
