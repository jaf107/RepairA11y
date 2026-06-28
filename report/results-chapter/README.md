# Results and Analysis chapter: build and reproduction

This folder contains the thesis "Results and Analysis" chapter for RepairA11y in
three content-identical forms, plus the figures and the script that draws them.

```text
results.md            full chapter, Markdown
results.tex           same chapter, LaTeX (compiles to results.pdf)
README.md             this file
figures/
  make_figures.py       regenerates the two charts from the latest experiment JSON
  make_dd_examples.mjs  regenerates the D_d before/after screenshots from recorded LLM patches
  *.png                 the charts and the before/after example images
```

The Markdown and the LaTeX carry the same numbers. The LaTeX is the canonical
typeset form; the Markdown is for quick reading and review.

## Scope of the chapter

The chapter reports one central study and its supporting evidence:

- RQ1, the evidence ablation (E1 to E4) on the controlled corpus D_d.
- A safety check (regression rate, pixel similarity) measured on the same RQ1 runs.
- D_r, the production scan (scale of the problem) and the live repair results.

An earlier rule-based-versus-LLM comparison (RQ1), a separate rule-based generator,
and the D_new corpus are intentionally not reported here.

## Provenance of the numbers

All numbers come from recorded live runs dated 2026-06-20 and 2026-06-21. A fresh
re-run of the LLM experiments was attempted but could not complete, because the
OpenRouter free-tier quota was exhausted (every call returned HTTP 429). To refresh
the numbers once quota is available, follow "Refreshing the numbers" at the end.

## Compiling the LaTeX

Requires a TeX distribution with `booktabs`, `amsmath`, `graphicx`, and `siunitx`
(all standard, present in TeX Live and MacTeX).

```bash
cd report/results-chapter
pdflatex -halt-on-error results.tex
pdflatex -halt-on-error results.tex   # second pass resolves cross-references
```

This produces `results.pdf`. The second pass is required because the document uses
`\ref` to tables and figures. The figures in `figures/*.png` must exist before
compiling; they are committed, and can be regenerated (see below). `latexmk -pdf
results.tex` also works and runs the passes automatically.

## Regenerating the figures

```bash
python3 report/results-chapter/figures/make_figures.py
```

This needs Python with `matplotlib`. It globs the newest `run-*.json` /
`scan-*.json` in each experiment results directory, recomputes the per-level and
per-SC rates from the raw trial rows (it does not read any precomputed summary for
the bar values), and writes the two PNGs. Because it recomputes from the JSON, the
charts always match the tables.

The before/after example images (Table 5.6, Figure 5.1) are produced separately:

```bash
node report/results-chapter/figures/make_dd_examples.mjs
```

This reads the actual LLM patches recorded in the RQ1 ablation JSON
(`run-2026-06-21T06-19-00-943Z.json`), applies each one to its D_d fixture with the
real patch applier (`src/patches/applier.js`), and screenshots the focused element
before and after. No API call is made, because the patches are already recorded; the
"after" image therefore shows exactly what the recorded LLM patch produces.

## Reproducing every headline number

Each command below regenerates the data behind a specific number. The LLM
experiments need an OpenRouter API key in `.env` at the repo root
(`OPENROUTER_API_KEY=...`) and are rate-limited to 3 requests per minute on the free
tier, so they take a long time. Run all commands from the repo root.

### Environment setup (once)

```bash
npm install
npx playwright install chromium
```

### RQ1 — evidence ablation (Tables 5.4, 5.5, 5.10; Figure 5.1)

```bash
node --env-file=.env experiments/rq2_evidence_ablation/run.js --runs 3 --seeds 1,2,3
```

- Source of truth (recorded): `experiments/rq2_evidence_ablation/results/run-2026-06-21T06-19-00-943Z.json`.
- Per-level rates and the McNemar table are in the `.md` next to the JSON and in
  `summary.tests` inside the JSON.

Recorded D_d per-level: E1 66.7%, E2 53.7%, E3 92.6%, E4 88.9%.
McNemar E1 vs E3: chi-square 9.389, p 0.0022, h 0.680.

The Wilson intervals and an independent re-derivation of the McNemar cells:

```bash
python3 - <<'PY'
import math
def wilson(k,n,z=1.96):
    p=k/n; d=1+z*z/n
    c=(p+z*z/(2*n))/d
    h=z*math.sqrt(p*(1-p)/n+z*z/(4*n*n))/d
    return (100*(c-h),100*(c+h))
def mcnemar(b,c):
    chi=(abs(b-c)-1)**2/(b+c); return chi, math.erfc(math.sqrt(chi/2))
for lab,k,n in [("E1",36,54),("E2",29,54),("E3",50,54),("E4",48,54)]:
    lo,hi=wilson(k,n); print(lab, f"{100*k/n:.1f}%", f"CI ({lo:.1f},{hi:.1f})")
print("E1vE3", mcnemar(2,16))
PY
```

### Safety / regression (Table 5.6)

Measured on the same RQ1 run, not a separate experiment. The aggregate is in
`summary.aggregate` of the RQ1 JSON (and its `.md`):

- Trials: 216. Regression rate: 0.0%. Mean pixel similarity: 1.000.

### D_r — detection scan (Table 5.7; Figure 5.2)

```bash
node --env-file=.env experiments/dr_detection_scan/run.js
```

- Source of truth: newest `experiments/dr_detection_scan/results/scan-*.json`,
  field `summary.bySc`.
- Recorded run: `scan-2026-06-20T19-04-14-033Z.json`. SC 2.4.13: 25 sites, 1841
  violations, mean 70.81 per affected site.

### D_r — live repair (Table 5.8)

```bash
node --env-file=.env experiments/dr_repair_scan/run.js --level E3 --limit 25
```

- Single-run source: `experiments/dr_repair_scan/results/run-2026-06-25-E3-report.md`
  (10/21 = 48%, errors excluded).
- Best-of source: `experiments/dr_repair_scan/results/best-of-report.md`
  (18/25 = 72%, best outcome per site across retries).

## Metric definitions (where they live in code)

- RESOLVED / UNRESOLVED / REGRESSED status: `src/verifier/index.js`.
- Resolution rate, regression rate, per-group rates: `src/reporting/aggregate.js`.
- Pixel similarity (called "SSIM" in code, but it is a pixelmatch pixel diff):
  `src/verifier/ssim.js`.
- McNemar (continuity-corrected) and Cohen's h: `experiments/_common/stats.js`.

## Refreshing the numbers after a new run

1. Run the experiment commands above; new `run-*.json` / `scan-*.json` files appear
   in each results directory.
2. Regenerate figures: `python3 report/results-chapter/figures/make_figures.py`
   (it auto-picks the newest files).
3. Update the matching tables in `results.md` and `results.tex` with the new counts.
   The two files must stay identical in their numbers.
4. Recompile: `pdflatex results.tex` twice.
5. Cross-check that every number in `results.tex` matches `results.md`.
