/**
 * D_new corpus — realistic edge cases authored to mirror real-world patterns
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
const CASES_DIR = join(repoRoot, "datasets/dnew/cases");

function f(rel) {
  return join(CASES_DIR, rel);
}

export const DNEW_CASES = [
  {
    id: "dnew-01",
    file: f("dnew-01-modal-traps-focus-behind-backdrop.html"),
    scs: ["2.4.11", "2.4.12"],
    expectFail: true,
    description: "Modal close button rendered below translucent backdrop (z-index mistake)",
  },
  {
    id: "dnew-02",
    file: f("dnew-02-input-focus-color-only.html"),
    scs: ["2.4.13"],
    expectFail: true,
    description: "outline:none with 1px border-color change only — fails width + contrast",
  },
  {
    id: "dnew-03",
    file: f("dnew-03-skiplink-positive-tabindex-nav.html"),
    scs: ["2.4.3"],
    expectFail: true,
    description: "Primary nav link has tabindex=3, forcing it ahead in tab order — SC 2.4.3 violation",
  },
  {
    id: "dnew-04",
    file: f("dnew-04-global-outline-none-reset.html"),
    scs: ["2.4.13"],
    expectFail: true,
    description: "Global * { outline:none } CSS reset — common real-world anti-pattern, multi-element page",
  },
  {
    id: "dnew-05",
    file: f("dnew-05-bootstrap-style-btn-focus-shadow.html"),
    scs: ["2.4.13"],
    expectFail: true,
    description: "Bootstrap-style box-shadow focus ring at ~2.8:1 contrast (< 3:1 minimum)",
  },
  {
    id: "dnew-06",
    file: f("dnew-06-css-variables-focus-color.html"),
    scs: ["2.4.13"],
    expectFail: true,
    description: "CSS custom property --focus-ring-color resolves to insufficient contrast",
  },
  {
    id: "dnew-07",
    file: f("dnew-07-sticky-header-obscures-focus.html"),
    scs: ["2.4.13"],
    expectFail: true,
    description: "Multi-link page with sticky header — NavA11y detects 12 × SC 2.4.13 violations on links",
  },
  {
    id: "dnew-08",
    file: f("dnew-08-tailwind-style-ring-insufficient.html"),
    scs: ["2.4.13"],
    expectFail: true,
    description: "Tailwind-style ring-2 ring-blue-300 — outline-offset creates gap, effective contrast < 3:1",
  },
  {
    id: "dnew-09",
    file: f("dnew-09-dark-theme-focus-invisible.html"),
    scs: ["2.4.13"],
    expectFail: true,
    description: "Dark theme: focus outline same color as dark background, contrast ~1:1",
  },
];

export function dnewCasesForSc(sc, { failOnly = true } = {}) {
  return DNEW_CASES.filter(
    (c) => c.scs.includes(sc) && (!failOnly || c.expectFail !== false),
  );
}
