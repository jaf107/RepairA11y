# Architecture: Dynamic WCAG 2.4 Testing Framework

> **Purpose:** Reference document describing the complete system architecture, data flow, and module responsibilities. Derived from codebase static analysis.

---

## 1. System Overview

The tool is a **dynamic accessibility testing framework** that detects WCAG 2.4 (Navigable) violations by instrumenting a live Chromium browser via Playwright. Unlike static HTML inspection, it simulates real keyboard navigation and inspects runtime CSS state to catch violations that only manifest during user interaction.

**Checks covered:** WCAG 2.4.3 (A), 2.4.7 (AA), 2.4.11 (AA), 2.4.12 (AAA), 2.4.13 (AAA)

---

## 2. Directory Structure

```
dynamic-testing/
├── run-check.js                  # CLI entry point
├── config/
│   └── default.json              # Check registry, thresholds, timing config
├── explorer/
│   └── runner.js                 # Orchestrator: browser lifecycle, Tab loop, check dispatch
├── instrumentation/
│   ├── index.js                  # Browser-injected: CSS snapshots, obscuration grid, focus capture
│   └── focus-navigation.js       # Browser-injected: DOM-order focusable list, selector utils
├── checks/
│   ├── focus-heuristics.js       # Shared: 8-type visual change detection engine
│   ├── 2_4_3_focus_order.js      # Page-level: focus order analysis
│   ├── 2_4_7_focus_visible.js    # Element-level: focus indicator visibility (AA)
│   ├── 2_4_11_focus_not_obscured_minimum.js  # Element-level: obstruction (AA)
│   ├── 2_4_12_focus_not_obscured_enhanced.js # Element-level: obstruction (AAA)
│   └── 2_4_13_focus_appearance.js            # Element-level: indicator appearance (AAA)
├── utils/
│   ├── color-utils.js            # WCAG luminance, contrast ratio, color parsing
│   └── geometry-utils.js         # Spatial ordering, Kendall τ, jump detection
├── reporter/
│   └── index.js                  # HTML/JSON report generation, annotated screenshots
├── fixtures/                     # Local HTML test pages
├── reports/                      # Generated per-site report directories
├── benchmark.mjs                 # Multi-tool comparison harness
└── results/                      # Benchmark output data
```

---

## 3. Execution Flow

### 3.1 Entry Point — `run-check.js`

Accepts a URL or local file path via CLI:
```
node run-check.js <url>
node run-check.js --file ./fixtures/test-page.html
```

Validates input, converts local files to `file://` URLs, and calls `run(url)` from the orchestrator.

### 3.2 Orchestrator — `explorer/runner.js`

The orchestrator manages the entire test lifecycle in this sequence:

```
1. Load configuration         →  config/default.json
2. Dynamically import checks  →  Only checks listed in config.checks.enabled
3. Launch Chromium             →  playwright.chromium.launch()
4. Inject instrumentation      →  page.addInitScript(instrumentation/index.js)
5. Navigate to target URL      →  page.goto(url, { waitUntil: 'domcontentloaded' })
6. Wait for hydration          →  1000ms buffer for client-side scripts
7. Run PAGE-LEVEL checks       →  Collect page data, dispatch to 2.4.3
8. Run ELEMENT-LEVEL checks    →  Per-element Tab loop, dispatch to 2.4.7/11/12/13
9. Close browser               →  browser.close()
10. Generate reports            →  JSON + HTML + screenshots
```

#### Step 7: Page-Level Data Collection (`collectPageData`)

```
a. Call __getAllFocusableElements()  →  DOM-order list of all tabbable elements
b. Focus document body (reset)
c. Tab loop:
   - Press Tab key via page.keyboard.press('Tab')
   - Wait 50ms for focus shift
   - Call __captureFocusedElement() to record active element
   - Stop conditions:
     • Focus returns to first element (cycle complete)
     • Same element focused 3 times consecutively (focus trap)
     • Iteration limit reached: min(domOrder.length + 10, 200)
d. Return { url, domOrder, tabSequence }
```

#### Step 8: Element-Level Check Loop

```
For each tabbable element:
  a. Scroll element into view
  b. Call __snapshotComputedStyle(el)        →  "before" state
  c. Focus element via page.focus(selector)
  d. Wait 300ms for CSS transitions
  e. Call __snapshotComputedStyle(el)        →  "after" state
  f. Call __getObscurationData(el)           →  obscuration probe
  g. Build trace = { element, before, after, obscuration }
  h. Run each element-level check with trace
  i. On failure: capture annotated screenshot
```

---

## 4. Instrumentation Layer

Scripts injected into the browser context via `addInitScript()`. They run inside the page's JavaScript environment and expose functions callable via `page.evaluate()`.

### 4.1 `__snapshotComputedStyle(el)` — CSS State Capture

Calls `window.getComputedStyle(el)` and extracts **22 CSS properties**:

| Category | Properties |
|---|---|
| Outline | `outlineStyle`, `outlineWidth`, `outlineColor`, `outlineOffset` |
| Box Shadow | `boxShadow` |
| Border | `borderTopWidth`, `borderRightWidth`, `borderBottomWidth`, `borderLeftWidth`, `borderColor`, `borderTopColor` |
| Color | `backgroundColor`, `color` |
| Visibility | `opacity`, `visibility`, `display` |
| Transform | `transform` |
| Text | `textDecorationLine`, `textDecorationStyle`, `textDecorationColor`, `textDecorationThickness` |
| Filter | `filter` |

Also captures:
- `el.matches(':focus-visible')` state
- `el.getBoundingClientRect()` bounding box
- `::before` and `::after` pseudo-element snapshots (content, outline, shadow, background, border, position, dimensions)

### 4.2 `__getObscurationData(el)` — 7×7 Grid Occlusion Probe

1. Compute the element's visible viewport intersection
2. Project a **7×7 grid** (49 sample points) evenly across the visible area
3. At each point, call `document.elementsFromPoint(x, y)`
4. Walk the element stack top-down:
   - If the target element or its descendant is hit first → **visible**
   - If an overlapping element is hit first → check if it's "solid":
     - `opacity > 0.1` **AND** one of:
       - Non-transparent `backgroundColor`
       - Replaced element (`IMG`, `VIDEO`, `IFRAME`, `CANVAS`, `SVG`)
       - Native input (`BUTTON`, `INPUT`, `SELECT`, `TEXTAREA`)
       - Has `backdrop-filter`
     - If solid → **obscured at this point**
5. Calculate:
   ```
   obscuredRatio = obscuredPoints / totalPoints
   isFullyObscured  = obscuredRatio >= 0.99
   isPartiallyObscured = obscuredRatio > 0
   ```
6. Return `{ obscuredRatio, isPartiallyObscured, isFullyObscured, obscuredBy[] }`

### 4.3 `__captureFocusedElement()` — Active Element Metadata

Returns for `document.activeElement`:
- CSS selector (unique path using `nth-of-type`)
- `tagName`, `tabIndex`
- Bounding box (`top`, `left`, `bottom`, `right`, `width`, `height`)
- Attributes: `id`, `class`, `role`, `aria-label`, `href`, `type`
- Visibility: `display`, `visibility`, `opacity`

### 4.4 `__getAllFocusableElements()` — DOM-Order Focusable List

Queries: `a[href], button, input, select, textarea, summary, iframe, [tabindex], [contenteditable]`

Filters out:
- `tabIndex < 0` (not in sequential focus navigation)
- `disabled` elements
- `input[type="hidden"]`
- `display: none` / `visibility: hidden` / `opacity: 0` (via `checkVisibility()`)
- Elements inside `[inert]` subtrees

Returns array with `domIndex`, `selector`, `tagName`, `tabIndex`, `bbox`, `attributes`.

---

## 5. Check Modules

### 5.1 WCAG 2.4.3 Focus Order (Level A) — Page-Level

**File:** `checks/2_4_3_focus_order.js`  
**Input:** `{ tabSequence, domOrder, url }`  
**Runs:** Once per page

Performs 5 sub-analyses:

| Sub-Check | Method | Threshold |
|---|---|---|
| **Positive tabindex** | Flag elements with `tabIndex > 0` (except skip links) | Any = high severity |
| **Spatial jumps** | Detect large backward vertical (>200px) or horizontal (>500px) jumps between consecutive Tab stops | Configurable |
| **Focus traps** | Same element focused consecutively | Any repeat = high severity |
| **Truncated sequence** | `tabSequence.length / domOrder.length < 0.5` | 50% (60% for ≤3 elements) |
| **Order divergence** | Kendall τ between DOM order and Tab order | >0.10 (from config) |

Additional analysis:
- **Small-set sensitivity:** For ≤5 elements, any divergence >0 is flagged as high severity
- **Visual order comparison:** Computes spatial reading order (top-to-bottom, left-to-right with 10px vertical grouping threshold), compares against Tab order via Kendall τ

**Result:** `PASS` / `FAIL` / `REVIEW` with violation details.

### 5.2 WCAG 2.4.7 Focus Visible (Level AA) — Element-Level

**File:** `checks/2_4_7_focus_visible.js`  
**Input:** `{ before, after, element }`

Logic:
1. Detect all visual changes via `detectFocusChanges(before, after)` (shared heuristics)
2. Filter for `high` or `medium` confidence changes
3. Check for **F78 regressions**: if border *decreased* on focus without a compensating positive indicator (e.g., outline added ≥ removed border width) → FAIL
4. If any significant positive change exists → PASS
5. No detectable visual change → FAIL

### 5.3 WCAG 2.4.13 Focus Appearance (Level AAA) — Element-Level

**File:** `checks/2_4_13_focus_appearance.js`  
**Input:** `{ before, after, element }`

Stricter than 2.4.7. Validates:
1. **Outline width ≥ 2px** (configurable `minOutlineWidth`)
2. **Background contrast ratio ≥ 3:1** between before/after states (configurable `minContrastRatio`)
3. **Border width increase ≥ 2px** AND border-vs-background contrast ≥ 3:1
4. Box shadow or text-decoration presence (benefit of the doubt)

Requires at least one indicator to pass all applicable sub-checks.

### 5.4 WCAG 2.4.11 Focus Not Obscured Minimum (Level AA) — Element-Level

**File:** `checks/2_4_11_focus_not_obscured_minimum.js`  
**Input:** `{ element, obscuration }`

- `isFullyObscured` (≥99%) → **FAIL**
- `isPartiallyObscured` (>0% but <99%) → **PASS** (partial visibility satisfies AA)
- No obscuration → **PASS**

### 5.5 WCAG 2.4.12 Focus Not Obscured Enhanced (Level AAA) — Element-Level

**File:** `checks/2_4_12_focus_not_obscured_enhanced.js`  
**Input:** `{ element, obscuration }`

- Any obscuration (>0%) → **FAIL** (AAA requires zero obstruction)
- No obscuration → **PASS**

---

## 6. Shared Detection Engine — `focus-heuristics.js`

Central visual change detection used by both 2.4.7 and 2.4.13. Compares before/after CSSOM snapshots and returns an array of detected changes:

| Change Type | Detection Logic | Confidence |
|---|---|---|
| `outline-appeared` | `outlineStyle` went from `none`/0px to visible | high |
| `outline-grew` | `outlineWidth` increased by >0.5px | high |
| `outline-offset-changed` | `outlineOffset` change >0.5px | medium |
| `box-shadow-changed` | `boxShadow` value changed from `none` or different | high |
| `border-width-increased` | Any side increased by >1px | high |
| `border-width-decreased` | Any side decreased by ≥1px (F78 regression) | medium |
| `border-color-changed` | Border color changed while width >0 | medium |
| `background-contrast-changed` | Before/after background contrast ratio >1.1:1 | high |
| `background-opacity-changed` | Background alpha change >0.1 | medium |
| `text-decoration-appeared` | `textDecorationLine` changed from `none` | high |
| `pseudo-*-appeared` | `::before`/`::after` content went from null to present | high |
| `pseudo-*-background-changed` | Pseudo-element background color changed | medium |
| `pseudo-*-outline-appeared` | Pseudo-element outline width increased | high |
| `opacity-changed` | Element opacity change >0.1 | medium |
| `transform-changed` | Transform value changed from `none` | low |

**Design decision:** The module does **not** use `:focus-visible` state as evidence of a visual indicator. CSS can declare `:focus-visible { outline: none; }`, making the pseudo-class unreliable. Only actual CSS property changes are detected.

---

## 7. Utility Libraries

### 7.1 `utils/color-utils.js`

| Function | Purpose |
|---|---|
| `parseColor(str)` | Parse `rgb()`, `rgba()`, hex (`#fff`, `#ffffff`), named colors → `{r,g,b,a}` |
| `getLuminance(color)` | WCAG relative luminance: `0.2126R + 0.7152G + 0.0722B` with gamma correction |
| `getContrastRatio(c1, c2)` | WCAG contrast ratio: `(L1 + 0.05) / (L2 + 0.05)` |
| `meetsContrastRequirement(ratio, threshold)` | Boolean check against threshold (default 3:1) |
| `getContrastChange(before, after, ref)` | Delta in contrast ratios for focus state change |

### 7.2 `utils/geometry-utils.js`

| Function | Purpose |
|---|---|
| `calculateSpatialOrder(elements)` | Sort by visual reading order (top-to-bottom, left-to-right; 10px vertical grouping) |
| `detectFocusOrderJumps(seq, config)` | Flag backward vertical jumps >200px, horizontal jumps >500px |
| `calculateOrderDivergence(dom, tab)` | Kendall τ rank correlation (pairwise disagreement ratio, 0–1) |
| `compareDOMvsVisualOrder(dom, visual)` | Combined divergence score + mismatch list |
| `classifyJumpSeverity(jump)` | Classify jump as high/medium/low based on distance |
| `isLikelyInModal(element)` | Heuristic: selector contains dialog/modal/overlay patterns |
| `groupByContainer(elements)` | Group elements by top-level DOM container |

---

## 8. Report Generation — `reporter/index.js`

### Outputs per run (saved to `reports/<sanitized-url>/`):

| Output | Format | Content |
|---|---|---|
| `results.json` | JSON | Full result array with evidence, measurements, element metadata |
| `index.html` | HTML | Interactive report with per-SC filtering, summary stats, expandable evidence |
| `<sc>/*.png` | PNG | Annotated screenshots: red 4px outline + diagnostic badge on failed elements |

### Screenshot annotation process:
1. Remove any previous annotations
2. Add red outline (`4px solid #ff0000`, 2px offset) to failed element
3. Overlay diagnostic badge (red background, white text, z-index max)
4. Capture viewport screenshot
5. Clean up annotations

---

## 9. Configuration — `config/default.json`

### Check Registry
```json
{
  "checks": {
    "enabled": ["2.4.11", "2.4.12", "2.4.7", "2.4.13", "2.4.3"],
    "registry": {
      "<sc>": {
        "name": "...",
        "level": "A|AA|AAA",
        "checkLevel": "element|page",
        "module": "../checks/<file>.js",
        "function": "<exportedFunctionName>"
      }
    }
  }
}
```

Adding a new check requires only:
1. Create a module in `checks/` exporting a function with signature `(trace, config) → { result, reason, evidence, sc }`
2. Register it in `config.checks.registry`
3. Add its ID to `config.checks.enabled`

### Thresholds

| SC | Parameter | Value |
|---|---|---|
| 2.4.3 | `maxBackwardJump` | 200px |
| 2.4.3 | `maxHorizontalJump` | 500px |
| 2.4.3 | `maxOrderDivergence` | 0.10 (10%) |
| 2.4.7 | `outlineMinWidth` | 0.5px |
| 2.4.7 | `borderWidthDelta` | 1px |
| 2.4.11 | `maxObscuredRatio` | 0.99 |
| 2.4.12 | `maxObscuredRatio` | 0.0 |
| 2.4.13 | `minContrastRatio` | 3:1 |
| 2.4.13 | `minOutlineWidth` | 2px |

### Timing

| Delay | Value | Purpose |
|---|---|---|
| `postFocus` | 300ms | Wait for CSS transitions/animations after focusing |
| `hydration` | 1000ms | Wait for client-side scripts after page load |
| `scrollSettle` | 100ms | Wait after scrolling element into view |

---

## 10. Data Flow Diagram

```
                    ┌─────────────┐
                    │  URL / File  │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │ run-check.js │  CLI argument parsing
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │  runner.js   │  Orchestrator
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
    ┌─────────▼──────┐   Load    ┌─────▼─────────┐
    │  Launch Browser │  Config   │ Import Checks  │
    │  (Playwright)   │          │ (dynamic)      │
    └─────────┬──────┘           └─────┬─────────┘
              │                        │
    ┌─────────▼──────────────┐         │
    │  Inject Instrumentation │         │
    │  (addInitScript)        │         │
    └─────────┬──────────────┘         │
              │                        │
    ┌─────────▼──────────────┐         │
    │  Navigate to URL        │         │
    │  Wait 1000ms hydration  │         │
    └─────────┬──────────────┘         │
              │                        │
    ┌─────────▼──────────────────────────────────────┐
    │  PAGE-LEVEL PHASE                               │
    │  ┌─────────────────────────────────────────┐   │
    │  │ __getAllFocusableElements() → domOrder   │   │
    │  │ Tab loop → tabSequence                  │   │
    │  │   • Press Tab, wait 50ms                │   │
    │  │   • __captureFocusedElement()           │   │
    │  │   • Stop on cycle/trap/limit            │   │
    │  └─────────────────┬───────────────────────┘   │
    │                    │                            │
    │  ┌─────────────────▼───────────────────────┐   │
    │  │ 2.4.3 checkFocusOrder(pageData, config) │   │
    │  │   → positive tabindex, jumps, traps,    │   │
    │  │     divergence, visual order mismatch   │   │
    │  └─────────────────┬───────────────────────┘   │
    └────────────────────┼───────────────────────────┘
                         │
    ┌────────────────────▼───────────────────────────┐
    │  ELEMENT-LEVEL PHASE (for each tabbable el)    │
    │  ┌─────────────────────────────────────────┐   │
    │  │ scrollIntoView → __snapshotCSS (before) │   │
    │  │ page.focus()   → wait 300ms             │   │
    │  │                → __snapshotCSS (after)  │   │
    │  │                → __getObscurationData() │   │
    │  └─────────────────┬───────────────────────┘   │
    │                    │                            │
    │         ┌──────────┼──────────┬────────────┐   │
    │         │          │          │            │   │
    │    ┌────▼────┐ ┌───▼───┐ ┌───▼────┐ ┌────▼──┐│
    │    │  2.4.7  │ │ 2.4.13│ │ 2.4.11 │ │2.4.12 ││
    │    │ Visible │ │Appear.│ │Obsc.Min│ │Obsc.E.││
    │    └────┬────┘ └───┬───┘ └───┬────┘ └───┬───┘│
    │         │          │         │           │    │
    │         ▼          ▼         ▼           ▼    │
    │    focus-heuristics.js   (direct ratio check) │
    │         │                                     │
    │    color-utils.js                             │
    └────────────────────┬──────────────────────────┘
                         │
              ┌──────────▼──────────┐
              │   reporter/index.js  │
              └──────────┬──────────┘
                         │
           ┌─────────────┼─────────────┐
           │             │             │
    ┌──────▼──────┐ ┌────▼────┐ ┌─────▼──────┐
    │ results.json│ │index.html│ │ screenshots│
    └─────────────┘ └─────────┘ └────────────┘
```

---

## 11. Key Design Decisions

| Decision | Rationale |
|---|---|
| **CSSOM comparison over pixel screenshots** | Pixel-based visual regression is fragile (cursor blink, font rendering) and slow. CSSOM changes are deterministic and fast. |
| **7×7 grid sampling over polygon clipping** | 49 `elementsFromPoint()` calls approximate occlusion without expensive geometry computation. This is the smallest grid that reaches ≥99% agreement with a 10×10 pixel-level reference (validated by pilot study). |
| **Kendall τ over simple position diff** | Rank correlation captures pairwise ordering violations, not just absolute position changes. |
| **Dynamic Tab cap `min(N+10, 200)`** | Prevents infinite loops while allowing full traversal of typical pages. |
| **Opacity 0.1 threshold for "solid"** | Elements with ≤10% opacity are perceptually transparent; including them would cause false positives. |
| **0.99 threshold for "fully obscured"** | Accounts for browser floating-point rounding in grid calculations. |
| **300ms post-focus delay** | Covers CSS transition durations typically used for focus indicator animations. |
| **Config-driven check loading** | New checks require zero changes to the runner—register in JSON, implement module. |
| **No reliance on `:focus-visible`** | The pseudo-class indicates browser intent, not actual visibility. CSS can suppress indicators while `:focus-visible` is active. |
