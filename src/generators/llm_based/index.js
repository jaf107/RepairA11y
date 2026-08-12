import { createOpenRouterClient } from "./client_openrouter.js";
import { validatePatch } from "../../patches/validate.js";
import { ApplierError } from "../../patches/errors.js";
import { buildPrompt as buildSC2413 } from "./prompt_templates/sc_2_4_13.js";
import { buildPrompt as buildSC247 } from "./prompt_templates/sc_2_4_7.js";
import { buildPrompt as buildSC2411 } from "./prompt_templates/sc_2_4_11.js";
import { buildPrompt as buildSC2412 } from "./prompt_templates/sc_2_4_12.js";
import { buildPrompt as buildSC243 } from "./prompt_templates/sc_2_4_3.js";

const PROMPTS = {
  "2.4.13": buildSC2413,
  "2.4.7": buildSC247,
  "2.4.11": buildSC2411,
  "2.4.12": buildSC2412,
  "2.4.3": buildSC243,
};

/**
 * Build an LLM generator for a specific evidence level.
 *
 * @param {object} opts
 * @param {object} [opts.client]   OpenRouter-compatible client with completeJson()
 * @param {string} [opts.model]
 * @param {number} [opts.temperature] default 0
 * @param {number} [opts.maxAttempts] default 3 (schema-validation retries)
 * @param {string} [opts.evidenceLevel] for tagging only; the actual bundle is passed at call time
 * @returns {{ generate: (args) => Promise<patch|null>, lastUsage: object|null }}
 */
export function createLlmGenerator(opts = {}) {
  const {
    client = createOpenRouterClient(opts),
    model,
    temperature = 0,
    maxAttempts = 3,
    evidenceLevel,
  } = opts;
  const usageRecord = { calls: [] };

  async function generate({ violation, evidence, history, attempt }) {
    if (!violation) return null;
    const sc = violation.sc;
    const buildPrompt = PROMPTS[sc];
    if (!buildPrompt) {
      return null; // SC not covered.
    }
    if (!evidence) {
      throw new Error(`createLlmGenerator: evidence bundle required for ${sc}`);
    }

    const prompt = buildPrompt({ bundle: evidence, history });
    // E4 bundles carry an annotated element crop — attach it as a real image
    // part so vision-capable models actually see it (not just a text mention).
    const crop = evidence.screenshot?.annotatedCropBase64;
    const images = crop ? [crop] : undefined;

    for (let i = 1; i <= maxAttempts; i++) {
      const seed = (attempt ?? 1) * 1000 + i;
      const { json, model: usedModel, usage } = await client.completeJson({
        prompt,
        model,
        temperature,
        seed,
        images,
        maxAttempts: 3,
      });
      usageRecord.calls.push({
        sc,
        evidenceLevel,
        loopAttempt: attempt,
        innerAttempt: i,
        model: usedModel,
        usage,
        promptHash: hashString(prompt),
      });

      if (
        json &&
        Object.prototype.hasOwnProperty.call(json, "patch_type") &&
        json.patch_type === null
      ) {
        return null; // Explicit decline.
      }

      try {
        validatePatch(json);
        return json;
      } catch (e) {
        if (!(e instanceof ApplierError)) throw e;
        // schema invalid — retry with a stricter follow-up prompt.
      }
    }
    return null;
  }

  return { generate, usage: usageRecord, client };
}

function hashString(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}

export { createOpenRouterClient } from "./client_openrouter.js";
export { buildSC2413 as buildSC2413Prompt };
