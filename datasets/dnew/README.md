# D_new — Hand-Curated Focus-Behavior Test Set

Companion artifact to RepairA11y. Each case is a deliberately broken HTML page
that exercises a WCAG 2.4 focus-behavior violation pattern under-represented
in `D_d` (the NavA11y controlled dataset). All cases are runnable via:

```bash
node nava11y/run-check.js --file datasets/dnew/cases/<case>.html
```

## Cases

| ID | File | Target SCs |
|----|------|------------|
| dnew-01 | `dnew-01-modal-traps-focus-behind-backdrop.html` | 2.4.11, 2.4.12 |
| dnew-02 | `dnew-02-input-focus-color-only.html` | 2.4.13 |
| dnew-03 | `dnew-03-skiplink-positive-tabindex-nav.html` | 2.4.3 (out of scope) |

## License

CC-BY-4.0. Cite as: RepairA11y D_new release, 2026.

## Adding cases

1. Create the HTML file under `cases/`.
2. Add a manifest entry to `manifest.json`.
3. Run `node nava11y/run-check.js --file datasets/dnew/cases/<file>` and
   verify the expected SCs FAIL.
4. (Optional) author a ground-truth patch and store under `../ground-truth/`.
