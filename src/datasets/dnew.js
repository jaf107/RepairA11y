/**
 * D_a corpus (formerly D_new) — realistic edge cases authored to mirror real-world patterns
 * found in D_r production sites. Cases use multi-element pages, CSS frameworks,
 * class selectors, CSS custom properties, and component-level styling — patterns
 * absent from D_d's single-button fixtures.
 *
 * SC mapping uses NavA11y's actual output (verified by running detection on each
 * fixture), not the intended violation type.
 */
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..", "..");
const CASES_DIR = join(repoRoot, "datasets/da/cases");

function f(rel) {
  return join(CASES_DIR, rel);
}

export const DNEW_CASES = [
  {
    id: "da-01",
    file: f("da-01-modal-traps-focus-behind-backdrop.html"),
    scs: ["2.4.11", "2.4.12"],
    expectFail: true,
    description: "Modal close button rendered below translucent backdrop (z-index mistake)",
  },
  {
    id: "da-02",
    file: f("da-02-input-focus-color-only.html"),
    scs: ["2.4.13"],
    expectFail: true,
    description: "outline:none with 1px border-color change only — fails width + contrast",
  },
  {
    id: "da-03",
    file: f("da-03-skiplink-positive-tabindex-nav.html"),
    scs: ["2.4.3"],
    expectFail: true,
    description: "Primary nav link has tabindex=3, forcing it ahead in tab order — SC 2.4.3 violation",
  },
  {
    id: "da-04",
    file: f("da-04-global-outline-none-reset.html"),
    scs: ["2.4.13"],
    expectFail: true,
    description: "Global * { outline:none } CSS reset — common real-world anti-pattern, multi-element page",
  },
  {
    id: "da-05",
    file: f("da-05-bootstrap-style-btn-focus-shadow.html"),
    scs: ["2.4.13"],
    expectFail: true,
    description: "Bootstrap-style box-shadow focus ring at ~2.8:1 contrast (< 3:1 minimum)",
  },
  {
    id: "da-06",
    file: f("da-06-css-variables-focus-color.html"),
    scs: ["2.4.13"],
    expectFail: true,
    description: "CSS custom property --focus-ring-color resolves to insufficient contrast",
  },
  {
    id: "da-07",
    file: f("da-07-sticky-header-obscures-focus.html"),
    scs: ["2.4.13"],
    expectFail: true,
    description: "Multi-link page with sticky header — NavA11y detects 12 × SC 2.4.13 violations on links",
  },
  {
    id: "da-08",
    file: f("da-08-tailwind-style-ring-insufficient.html"),
    scs: ["2.4.13"],
    expectFail: true,
    description: "Tailwind-style ring-2 ring-blue-300 — outline-offset creates gap, effective contrast < 3:1",
  },
  {
    id: "da-09",
    file: f("da-09-dark-theme-focus-invisible.html"),
    scs: ["2.4.13"],
    expectFail: true,
    description: "Dark theme: focus outline same color as dark background, contrast ~1:1",
  },

  // ----- SC 2.4.11 / 2.4.12 — Focus Not Obscured (obscuration corpus) -----
  // Full-obscuration cases (obscuredRatio ≥ 0.99) fail BOTH 2.4.11 (minimum)
  // and 2.4.12 (enhanced). Partial-obscuration cases (0 < ratio < 0.99) fail
  // only 2.4.12. SC mapping verified by running NavA11y detection on each file.
  {
    id: "da-10",
    file: f("da-10-sticky-header-covers-anchor-target.html"),
    scs: ["2.4.11", "2.4.12"],
    expectFail: true,
    description: "Quick-jump link fully hidden under fixed 80px sticky site header (ratio 1)",
  },
  {
    id: "da-11",
    file: f("da-11-chat-widget-covers-back-to-top.html"),
    scs: ["2.4.11", "2.4.12"],
    expectFail: true,
    description: "Back-to-top button stacked beneath fixed chat launcher in same corner (ratio 1)",
  },
  {
    id: "da-12",
    file: f("da-12-promo-bar-covers-newsletter-submit.html"),
    scs: ["2.4.11", "2.4.12"],
    expectFail: true,
    description: "Newsletter submit button fully covered by fixed bottom promo bar (ratio 1)",
  },
  {
    id: "da-13",
    file: f("da-13-social-fab-covers-footer-link.html"),
    scs: ["2.4.12"],
    expectFail: true,
    description: "Footer contact link ~53% covered by floating social FAB — partial (2.4.12 only)",
  },
  {
    id: "da-14",
    file: f("da-14-leftover-overlay-covers-retry.html"),
    scs: ["2.4.11", "2.4.12"],
    expectFail: true,
    description: "Leftover near-invisible full-page scrim (z-index 9999) fully obscures retry button (ratio 1)",
  },
  {
    id: "da-15",
    file: f("da-15-sticky-header-partially-covers-input.html"),
    scs: ["2.4.12"],
    expectFail: true,
    description: "Top ~43% of focused search input tucked under sticky header — partial (2.4.12 only)",
  },
  {
    id: "da-16",
    file: f("da-16-cookie-strip-partially-covers-checkbox.html"),
    scs: ["2.4.12"],
    expectFail: true,
    description: "Lower ~57% of focused consent button under fixed cookie strip — partial (2.4.12 only)",
  },
  {
    id: "da-17",
    file: f("da-17-sidebar-partially-covers-nav-link.html"),
    scs: ["2.4.11", "2.4.12"],
    expectFail: true,
    description: "Breadcrumb link fully covered by fixed left sidebar overlap (ratio 1)",
  },
];

export function dnewCasesForSc(sc, { failOnly = true } = {}) {
  return DNEW_CASES.filter(
    (c) => c.scs.includes(sc) && (!failOnly || c.expectFail !== false),
  );
}
