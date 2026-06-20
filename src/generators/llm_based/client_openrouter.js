/**
 * OpenRouter free-tier client.
 *
 * Free-tier models change frequently. We default to a reasonable free model
 * (override via OPENROUTER_MODEL env var). The client is `fetch`-based — no
 * SDK dependency.
 *
 * Usage:
 *   const client = createOpenRouterClient();
 *   const { json } = await client.completeJson({ prompt });
 *
 * For testing without an API key, pass `fetch` and `apiKey` via opts.
 */
const DEFAULT_MODEL = "deepseek/deepseek-chat-v3-0324:free";
const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

export class OpenRouterError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "OpenRouterError";
    Object.assign(this, details);
  }
}

export function createOpenRouterClient(opts = {}) {
  const apiKey = opts.apiKey ?? process.env.OPENROUTER_API_KEY;
  const fetchImpl = opts.fetch ?? globalThis.fetch;
  const baseModel = opts.model ?? process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL;
  const referer = opts.referer ?? "https://github.com/jaf107/RepairA11y";
  const title = opts.title ?? "RepairA11y";

  if (!fetchImpl) {
    throw new OpenRouterError(
      "fetch is not available — pass opts.fetch or use Node 18+",
    );
  }

  async function complete({
    prompt,
    model = baseModel,
    temperature = 0,
    maxTokens = 800,
    seed,
    responseFormat,
  }) {
    if (!apiKey) {
      throw new OpenRouterError(
        "OPENROUTER_API_KEY not set — set env var or pass opts.apiKey",
      );
    }
    const body = {
      model,
      messages: [{ role: "user", content: prompt }],
      temperature,
      max_tokens: maxTokens,
    };
    if (seed != null) body.seed = seed;
    if (responseFormat) body.response_format = responseFormat;

    const res = await fetchImpl(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": referer,
        "X-Title": title,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      // Retry on 429 rate-limit after Retry-After header (or 60s default).
      if (res.status === 429) {
        const retryAfter = parseInt(res.headers?.get?.("retry-after") ?? "60", 10);
        const wait = Math.min(Math.max(retryAfter, 10), 120) * 1000;
        console.warn(`[openrouter] 429 rate-limited — waiting ${wait / 1000}s`);
        await new Promise((r) => setTimeout(r, wait));
        throw new OpenRouterError(`OpenRouter HTTP 429 (retried after ${wait}ms)`, {
          status: 429,
          body: text,
          retryable: true,
        });
      }
      throw new OpenRouterError(
        `OpenRouter HTTP ${res.status}: ${text.slice(0, 500)}`,
        { status: res.status, body: text },
      );
    }
    const data = await res.json();
    const choice = data.choices?.[0];
    if (!choice) {
      throw new OpenRouterError("OpenRouter response missing choices[0]", {
        data,
      });
    }
    return {
      text: choice.message?.content ?? "",
      model: data.model ?? model,
      usage: data.usage ?? null,
      raw: data,
    };
  }

  async function completeJson(reqOpts) {
    const { maxAttempts = 5, ...rest } = reqOpts;
    let lastErr;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      let result;
      try {
        result = await complete({
          ...rest,
          responseFormat: { type: "json_object" },
        });
      } catch (err) {
        // Retry rate-limit errors (already waited inside complete()).
        if (err.retryable && attempt < maxAttempts) {
          lastErr = err;
          continue;
        }
        throw err;
      }
      const parsed = tryParseJson(result.text);
      if (parsed != null) {
        return { ...result, json: parsed };
      }
      lastErr = new OpenRouterError(
        `Response was not valid JSON (attempt ${attempt}/${maxAttempts})`,
        { text: result.text.slice(0, 500) },
      );
    }
    throw lastErr;
  }

  return { complete, completeJson, model: baseModel };
}

/**
 * Parse arbitrary LLM output to JSON. Tries: raw, fenced ```json blocks,
 * outermost {...} blob. Returns the object or null.
 */
export function tryParseJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {}
  const fenced = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  if (fenced) {
    try {
      return JSON.parse(fenced[1]);
    } catch {}
  }
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) {
    try {
      return JSON.parse(text.slice(first, last + 1));
    } catch {}
  }
  return null;
}

/**
 * Stub for legacy import path. Use createOpenRouterClient() instead.
 */
export async function generateRepair() {
  throw new OpenRouterError(
    "generateRepair() is deprecated — use createOpenRouterClient().completeJson()",
  );
}
