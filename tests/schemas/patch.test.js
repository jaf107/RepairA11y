import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import Ajv from "ajv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");

function load(relPath) {
  return JSON.parse(readFileSync(join(repoRoot, relPath), "utf8"));
}

const schema = load("src/schemas/patch.schema.json");
const GROUND_TRUTH = [
  "ground-truth/sc-2.4.13-focus-appearance-outline-contrast.json",
  "ground-truth/sc-2.4.11-focus-obscured-by-fixed-footer.json",
  "ground-truth/sc-2.4.3-positive-tabindex.json",
];

let validate;
beforeAll(() => {
  const ajv = new Ajv({ strict: false });
  validate = ajv.compile(schema);
});

describe("patch schema — ground-truth cases", () => {
  for (const relPath of GROUND_TRUTH) {
    it(`validates ${relPath}`, () => {
      const { patch } = load(relPath);
      const ok = validate(patch);
      expect(ok, JSON.stringify(validate.errors, null, 2)).toBe(true);
    });
  }
});

describe("patch schema — invalid cases rejected", () => {
  it("rejects unknown patch_type", () => {
    const bad = {
      patch_type: "teleport",
      target_selector: "button",
      payload: {},
      rationale: "x",
      wcag_technique_cited: null,
    };
    expect(validate(bad)).toBe(false);
  });

  it("rejects css_inject missing rule in payload", () => {
    const bad = {
      patch_type: "css_inject",
      target_selector: "button",
      payload: {},
      rationale: "x",
      wcag_technique_cited: null,
    };
    expect(validate(bad)).toBe(false);
  });

  it("rejects attr_set missing attribute in payload", () => {
    const bad = {
      patch_type: "attr_set",
      target_selector: "button",
      payload: { value: "0" },
      rationale: "x",
      wcag_technique_cited: null,
    };
    expect(validate(bad)).toBe(false);
  });

  it("rejects unknown wcag_technique_cited value", () => {
    const bad = {
      patch_type: "css_inject",
      target_selector: "button",
      payload: { rule: "button:focus { outline: 2px solid #000; }" },
      rationale: "x",
      wcag_technique_cited: "BOGUS99",
    };
    expect(validate(bad)).toBe(false);
  });

  it("rejects missing required top-level field", () => {
    const bad = {
      patch_type: "css_inject",
      payload: { rule: "button:focus { outline: 2px solid #000; }" },
      rationale: "x",
      wcag_technique_cited: null,
    };
    expect(validate(bad)).toBe(false);
  });
});
