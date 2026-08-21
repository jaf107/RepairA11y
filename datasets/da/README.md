# D_a — anti-pattern corpus for focus-behavior repair

Companion artifact to RepairA11y. Each of the seventeen cases re-creates, as a
small runnable page, a WCAG 2.4 focus-behavior failure pattern observed on the
production sites scanned in the NavA11y study.

The corpus was previously called `D_new`. Every case keeps its former
identifier in the `legacyId` field of `manifest.json`, so results recorded
under the old ids can still be matched.

## Provenance

Patterns were observed during the production scan of the NavA11y study. That
scan stored per-criterion counts rather than per-element evidence, so **no case
carries an attribution to a named site**, and the frequency of each pattern on
production pages is not established by this corpus.

The Success Criteria listed below are those NavA11y reports when run on the
finished page — not those intended when the case was authored. Three cases fail
an obscuration criterion only at the enhanced level (SC 2.4.12).

## Running

```bash
node nava11y/run-check.js --file datasets/da/cases/<case>.html
```

## Cases

| ID | File | Reported SCs | Pattern |
|----|------|--------------|---------|
| da-01 | `da-01-modal-traps-focus-behind-backdrop.html` | 2.4.11, 2.4.12 | Modal close button rendered below translucent backdrop (z-index mistake) |
| da-02 | `da-02-input-focus-color-only.html` | 2.4.13 | outline:none with 1px border-color change only — fails width + contrast |
| da-03 | `da-03-skiplink-positive-tabindex-nav.html` | 2.4.3 | Primary nav link has tabindex=3, forcing it ahead in tab order — SC 2.4.3 violation |
| da-04 | `da-04-global-outline-none-reset.html` | 2.4.13 | Global * { outline:none } CSS reset — common real-world anti-pattern, multi-element page |
| da-05 | `da-05-bootstrap-style-btn-focus-shadow.html` | 2.4.13 | Bootstrap-style box-shadow focus ring at ~2.8:1 contrast (< 3:1 minimum) |
| da-06 | `da-06-css-variables-focus-color.html` | 2.4.13 | CSS custom property --focus-ring-color resolves to insufficient contrast |
| da-07 | `da-07-sticky-header-obscures-focus.html` | 2.4.13 | Multi-link page with sticky header — NavA11y detects 12 × SC 2.4.13 violations on links |
| da-08 | `da-08-tailwind-style-ring-insufficient.html` | 2.4.13 | Tailwind-style ring-2 ring-blue-300 — outline-offset creates gap, effective contrast < 3:1 |
| da-09 | `da-09-dark-theme-focus-invisible.html` | 2.4.13 | Dark theme: focus outline same color as dark background, contrast ~1:1 |
| da-10 | `da-10-sticky-header-covers-anchor-target.html` | 2.4.11, 2.4.12 | Quick-jump link fully hidden under fixed 80px sticky site header (ratio 1) |
| da-11 | `da-11-chat-widget-covers-back-to-top.html` | 2.4.11, 2.4.12 | Back-to-top button stacked beneath fixed chat launcher in same corner (ratio 1) |
| da-12 | `da-12-promo-bar-covers-newsletter-submit.html` | 2.4.11, 2.4.12 | Newsletter submit button fully covered by fixed bottom promo bar (ratio 1) |
| da-13 | `da-13-social-fab-covers-footer-link.html` | 2.4.12 | Footer contact link ~53% covered by floating social FAB — partial (2.4.12 only) |
| da-14 | `da-14-leftover-overlay-covers-retry.html` | 2.4.11, 2.4.12 | Leftover near-invisible full-page scrim (z-index 9999) fully obscures retry button (ratio 1) |
| da-15 | `da-15-sticky-header-partially-covers-input.html` | 2.4.12 | Top ~43% of focused search input tucked under sticky header — partial (2.4.12 only) |
| da-16 | `da-16-cookie-strip-partially-covers-checkbox.html` | 2.4.12 | Lower ~57% of focused consent button under fixed cookie strip — partial (2.4.12 only) |
| da-17 | `da-17-sidebar-partially-covers-nav-link.html` | 2.4.11, 2.4.12 | Breadcrumb link fully covered by fixed left sidebar overlap (ratio 1) |

Seventeen cases carry 23 case–criterion pairs: 6 under SC 2.4.11, 9 under
SC 2.4.12, 7 under SC 2.4.13, and 1 under SC 2.4.3.

## License

CC-BY-4.0. Cite as: RepairA11y D_a release, 2026.

## Adding cases

1. Create the HTML file under `cases/`.
2. Add an entry to `src/datasets/dnew.js`.
3. Run `node nava11y/run-check.js --file datasets/da/cases/<file>` and record
   the Success Criteria it actually reports.
4. Regenerate `manifest.json` and this table from the dataset module.
