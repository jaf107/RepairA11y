# NavA11y: A Dynamic Analysis Approach for WCAG 2.4 Focus-Behavior Evaluation

> **Abu Jafar Saifullah, Tasmia Zerin, Zerina Begum, Kazi Sakib**  
> Institute of Information Technology, University of Dhaka, Bangladesh  
> *Accepted at ENASE 2026 (to appear)*

NavA11y is a dynamic accessibility testing tool that evaluates all five WCAG 2.4 focus-behavior Success Criteria (SCs) by driving a real browser, simulating keyboard navigation, and inspecting the rendered page state at each focus event. Unlike static analysis tools which inspect HTML, CSS, or ARIA attributes, NavA11y detects violations that only manifest at runtime, such as missing focus indicators, incorrect tab order, and element obscuration.

## Key Results

- **100% precision and recall** on a 22-page labeled dataset (D_d) covering all five focus-behavior SCs, with no false positives.
- **2,947 violations detected** across 26 real-world production websites (D_r), with a **90% true positive rate** confirmed by independent manual verification on a stratified sample.

## WCAG 2.4 Focus-Behavior Success Criteria

| SC | Full Name | Level |
| -- | --------- | ----- |
| 2.4.3 | Focus Order | A |
| 2.4.7 | Focus Visible | AA |
| 2.4.11 | Focus Not Obscured (Minimum) | AA |
| 2.4.12 | Focus Not Obscured (Enhanced) | AAA |
| 2.4.13 | Focus Appearance | AAA |

## How It Works

NavA11y performs two parallel analyses:

- **Page-Level Analysis (PLA)** — simulates a full keyboard traversal of the page to evaluate SC 2.4.3 (Focus Order). It records three orderings: DOM order, tab sequence, and visual reading order, and checks for rank divergence (Kendall τ), positive `tabindex` misuse, focus traps, truncated sequences, and spatial jumps.

- **Element-Level Analysis (ELA)** — individually focuses each tabbable element and captures its rendered CSS state before and after focus. It uses a 22-property CSSOM snapshot to evaluate SC 2.4.7 and 2.4.13, and a 7×7 grid occlusion probe to evaluate SC 2.4.11 and 2.4.12.

For a full description of the architecture and algorithms, see [ARCHITECTURE.md](ARCHITECTURE.md).

## Installation

**Prerequisites:** Node.js 16+, pnpm (or npm)

```bash
# Install dependencies
pnpm install

# Install Chromium
npx playwright install chromium
```

## Usage

```bash
# Test a URL
node run-check.js --url https://example.com

# Test a local file
node run-check.js --file ./fixtures/test-page.html
```

Reports are generated in `reports/<site>/`:

- `index.html` — interactive report with per-SC filtering and annotated screenshots
- `results.json` — machine-readable results with full evidence

### Evidence schema — style snapshots (SC 2.4.7 / 2.4.13)

For element-level records with `sc: "2.4.7"` or `sc: "2.4.13"` and `result: "FAIL" | "REVIEW"`, `evidence.styleSnapshots` contains the raw computed-style snapshots captured before and after focus:

```json
"evidence": {
  "styleSnapshots": {
    "before": {
      "outlineStyle": "none", "outlineWidth": 0, "outlineColor": "rgb(...)", "outlineOffset": 0,
      "boxShadow": "none",
      "borderTopWidth": 0, "borderTopColor": "rgb(...)", "borderColor": "rgb(...)",
      "backgroundColor": "rgb(...)", "color": "rgb(...)", "opacity": 1,
      "transform": "none", "visibility": "visible", "display": "inline-block",
      "textDecoration": "none", "textDecorationColor": "rgb(...)",
      "fontWeight": "400", "position": "static", "zIndex": "auto",
      "transition": "all 0s ease 0s", "filter": "none",
      "clip": "auto", "clipPath": "none"
    },
    "after": { ...same shape, post-focus values... }
  }
}
```

Absent on PASS records and on other SCs. Consumers should treat the field as optional for forward compat with older reports.

## Datasets

### D_d — Focus Behavior Dataset (Synthetic, Labeled)

A dataset of 22 labeled HTML test pages extended from the [GDS Accessibility Tool Audit](https://github.com/alphagov/accessibility-tool-audit), with known ground-truth verdicts covering all five focus-behavior SCs. Used for precision/recall evaluation.

- **Test pages:** `dataset/focus-behavior-dataset/tests/`
- **Metadata:** `dataset/focus-behavior-dataset/tests.json`
- **Run evaluation:** `node evaluation/run-gds-evaluation.mjs`

### D_r — Real-World Dataset (Production Websites)

26 high-traffic production websites drawn from the Semrush top-30 site rankings.

- **Site list:** `evaluation/dataset.json`
- **Run benchmark:** `node evaluation/run-all-benchmark.mjs`

## Citation

The paper is accepted at ENASE 2026 and will be presented in May 2026. A full citation will be added once the proceedings are published. If you use NavA11y or the dataset in your work, please cite:

```bibtex
@inproceedings{saifullah2026nava11y,
  title     = {NavA11y: A Dynamic Analysis Approach for WCAG 2.4 Focus-Behavior Evaluation},
  author    = {Saifullah, Abu Jafar and Zerin, Tasmia and Begum, Zerina and Sakib, Kazi},
  booktitle = {Proceedings of the 21st International Conference on Evaluation of Novel Approaches to Software Engineering (ENASE)},
  year      = {2026}
}
```

## License

[MIT](LICENSE) — © 2026 Abu Jafar Saifullah, Tasmia Zerin, Zerina Begum, Kazi Sakib
