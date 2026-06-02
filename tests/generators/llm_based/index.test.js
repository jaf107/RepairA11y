import { describe, it, expect, vi } from "vitest";
import { createLlmGenerator } from "../../../src/generators/llm_based/index.js";

const sampleViolation = {
  id: "v1",
  sc: "2.4.13",
  result: "FAIL",
  element: { selector: "button.x", bbox: {} },
  evidence: {
    styleSnapshots: {
      after: {
        outlineWidth: "0px",
        outlineColor: "rgba(0,0,0,0)",
        backgroundColor: "rgb(255,255,255)",
      },
    },
  },
};

const sampleBundle = {
  level: "E3",
  sc: "2.4.13",
  violationId: "v1",
  element: { selector: "button.x" },
  screenshot: {},
  wcagTechniques: "F78 — failure summary",
  runtimeSlice: { sc: "2.4.13" },
};

function mockClient(jsonOrFn) {
  return {
    completeJson: vi.fn().mockImplementation(async () => {
      const json = typeof jsonOrFn === "function" ? jsonOrFn() : jsonOrFn;
      return { json, model: "mock-model", usage: { total_tokens: 1 }, text: "" };
    }),
  };
}

describe("createLlmGenerator", () => {
  it("returns a valid patch on first attempt", async () => {
    const validPatch = {
      patch_type: "css_inject",
      target_selector: "button.x",
      payload: { rule: "button.x:focus-visible { outline: 2px solid #000; }" },
      rationale: "inject outline",
      wcag_technique_cited: "C27",
    };
    const gen = createLlmGenerator({ client: mockClient(validPatch) });
    const patch = await gen.generate({
      violation: sampleViolation,
      evidence: sampleBundle,
      history: [],
      attempt: 1,
    });
    expect(patch).toEqual(validPatch);
    expect(gen.usage.calls).toHaveLength(1);
  });

  it("retries up to maxAttempts when schema validation fails", async () => {
    let calls = 0;
    const gen = createLlmGenerator({
      client: mockClient(() => {
        calls++;
        if (calls < 3) {
          return { patch_type: "bogus_type" };
        }
        return {
          patch_type: "attr_set",
          target_selector: "a",
          payload: { attribute: "tabindex", value: "0" },
          rationale: "fix",
          wcag_technique_cited: "F44",
        };
      }),
      maxAttempts: 3,
    });
    const patch = await gen.generate({
      violation: { ...sampleViolation, sc: "2.4.13" },
      evidence: sampleBundle,
      history: [],
      attempt: 1,
    });
    expect(patch?.patch_type).toBe("attr_set");
    expect(gen.usage.calls).toHaveLength(3);
  });

  it("returns null when LLM explicitly declines (patch_type: null)", async () => {
    const gen = createLlmGenerator({
      client: mockClient({ patch_type: null, rationale: "can't fix" }),
    });
    const patch = await gen.generate({
      violation: sampleViolation,
      evidence: sampleBundle,
      history: [],
      attempt: 1,
    });
    expect(patch).toBeNull();
  });

  it("returns null for SC outside the prompt map", async () => {
    const gen = createLlmGenerator({ client: mockClient({}) });
    const patch = await gen.generate({
      violation: { ...sampleViolation, sc: "9.9.9" },
      evidence: sampleBundle,
      history: [],
      attempt: 1,
    });
    expect(patch).toBeNull();
  });

  it("returns null when all maxAttempts fail validation", async () => {
    const gen = createLlmGenerator({
      client: mockClient({ patch_type: "bogus_type" }),
      maxAttempts: 2,
    });
    const patch = await gen.generate({
      violation: sampleViolation,
      evidence: sampleBundle,
      history: [],
      attempt: 1,
    });
    expect(patch).toBeNull();
    expect(gen.usage.calls).toHaveLength(2);
  });
});
