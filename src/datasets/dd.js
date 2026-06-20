/**
 * D_d corpus index — mapping NavA11y test fixtures to expected target SCs.
 *
 * Each entry: { file, scs:[...], description }
 * The runner detects each fixture with NavA11y and selects FAIL records whose
 * SC matches the listed scs. This avoids re-running detection just to
 * categorize fixtures.
 *
 * Only the focus-behavior fixtures relevant to SC 2.4.7 / 2.4.11 / 2.4.12 /
 * 2.4.13 are listed (SC 2.4.3 dropped per project decision).
 */
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..", "..");
const TESTS_DIR = join(
  repoRoot,
  "nava11y/dataset/focus-behavior-dataset/tests",
);

function f(rel) {
  return join(TESTS_DIR, rel);
}

export const DD_CASES = [
  // ----- SC 2.4.13 — Focus Appearance (AAA) -----
  {
    id: "outline-insufficient-contrast",
    file: f("focus-appearance-outline-insufficient-contrast.html"),
    scs: ["2.4.13"],
    expectFail: true,
    description: "2px outline @ #999 on #fff (~2.85:1, below 3:1 minimum)",
  },
  {
    id: "outline-insufficient-width",
    file: f("focus-appearance-outline-insufficient-width.html"),
    scs: ["2.4.13"],
    expectFail: true,
    description: "Outline width below SC 2.4.13 area minimum",
  },
  {
    id: "outline-sufficient-width-and-contrast",
    file: f("focus-appearance-outline-sufficient-width-and-contrast.html"),
    scs: ["2.4.13"],
    expectFail: false,
    description: "Reference PASS case",
  },
  {
    id: "outline-offset-sufficient",
    file: f("focus-appearance-outline-offset-sufficient.html"),
    scs: ["2.4.13"],
    expectFail: false,
    description: "Reference PASS case with outline-offset",
  },
  {
    id: "border-insufficient-width",
    file: f("focus-appearance-border-insufficient-width.html"),
    scs: ["2.4.13"],
    expectFail: true,
    description: "Border-change-on-focus with insufficient width",
  },
  {
    id: "border-sufficient-width-and-contrast",
    file: f("focus-appearance-border-sufficient-width-and-contrast.html"),
    scs: ["2.4.13"],
    expectFail: false,
    description: "Reference PASS",
  },
  {
    id: "background-insufficient-contrast",
    file: f("focus-appearance-background-insufficient-contrast.html"),
    scs: ["2.4.13"],
    expectFail: true,
    description: "Background-change-on-focus with insufficient contrast delta",
  },
  {
    id: "background-sufficient-contrast",
    file: f("focus-appearance-background-sufficient-contrast.html"),
    scs: ["2.4.13"],
    expectFail: false,
    description: "Reference PASS",
  },

  // ----- SC 2.4.7 — Focus Visible (AA) -----
  // NavA11y classifies absent indicators under 2.4.13 (the stricter superset),
  // so these fixtures are mapped to 2.4.13 for runner target-finding.
  {
    id: "focus-not-visible",
    file: f("colour-and-contrast-focus-not-visible.html"),
    scs: ["2.4.13"],
    expectFail: true,
    description: "outline:none suppresses indicator (NavA11y reports as 2.4.13)",
  },
  {
    id: "focus-not-indicated-visually",
    file: f("keyboard-access-keyboard-focus-is-not-indicated-visually.html"),
    scs: ["2.4.13"],
    expectFail: true,
    description: "No visible focus indicator (NavA11y reports as 2.4.13)",
  },
  {
    id: "focus-visible-bg",
    file: f("focus-visible-using-background-colour-change.html"),
    scs: ["2.4.7"],
    expectFail: false,
    description: "Reference PASS — bg-change indicator",
  },
  {
    id: "focus-visible-border",
    file: f("focus-visible-using-border-increase.html"),
    scs: ["2.4.7"],
    expectFail: false,
    description: "Reference PASS — border-change indicator",
  },
  {
    id: "focus-visible-shadow",
    file: f("focus-visible-using-box-shadow.html"),
    scs: ["2.4.7"],
    expectFail: false,
    description: "Reference PASS — box-shadow indicator",
  },

  // ----- SC 2.4.11 / 2.4.12 — Focus Not Obscured -----
  {
    id: "obscured-by-fixed-footer",
    file: f("focus-obscured-by-fixed-footer.html"),
    scs: ["2.4.11", "2.4.12"],
    expectFail: true,
    description: "Focused button covered by fixed footer",
  },
  {
    id: "obscured-by-cookie-banner",
    file: f("focus-obscured-by-cookie-banner.html"),
    scs: ["2.4.11", "2.4.12"],
    expectFail: true,
    description: "Focused button covered by cookie banner",
  },
];

export function ddCasesForSc(sc, { failOnly = true } = {}) {
  return DD_CASES.filter(
    (c) =>
      c.scs.includes(sc) && (!failOnly || c.expectFail !== false),
  );
}
