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
const DEFAULT_MODEL = "google/gemma-4-31b-it:free";
// Any OpenAI-compatible chat-completions endpoint works — e.g. a local
// Ollama server (http://localhost:11434/v1/chat/completions) to avoid
// free-tier rate limits entirely. Override via LLM_ENDPOINT.
const ENDPOINT =
  process.env.LLM_ENDPOINT ?? "https://openrouter.ai/api/v1/chat/completions";
const IS_LOCAL = ENDPOINT.includes("localhost") || ENDPOINT.includes("127.0.0.1");
// For local Ollama we use the NATIVE /api/chat endpoint instead of the
// OpenAI-compat layer: it supports think:false (gemma4 is a thinking model —
// via the compat layer it burns max_tokens on hidden reasoning and returns
// empty content), strict format:"json", per-request num_ctx, and keep_alive
// (avoids ~60s model reloads between Playwright phases).
const NATIVE_ENDPOINT = IS_LOCAL
  ? ENDPOINT.replace(/\/v1\/chat\/completions\/?$/, "/api/chat")
  : null;
const LOCAL_NUM_CTX = parseInt(process.env.LLM_NUM_CTX ?? "16384", 10);

export class OpenRouterError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "OpenRouterError";
    Object.assign(this, details);
  }
}

// Module-level rate limiter shared across all client instances.
// DeepSeek free tier = 3 RPM → enforce 22s minimum between requests.
// Override via OPENROUTER_RPM env var (e.g. OPENROUTER_RPM=10 for paid tiers).
let _lastCallAt = 0;

async function _throttle() {
  // Read RPM at call time (not module load) so tests and callers can adjust
  // process.env.OPENROUTER_RPM after import.
  const rpm = parseInt(
    process.env.OPENROUTER_RPM ?? (IS_LOCAL ? "1000" : "3"),
    10,
  );
  const minIntervalMs = Math.ceil((60 / rpm) * 1000) + 500; // +500ms safety margin
  const now = Date.now();
  const elapsed = now - _lastCallAt;
  if (_lastCallAt > 0 && elapsed < minIntervalMs) {
    const wait = minIntervalMs - elapsed;
    console.warn(`[openrouter] rate-throttle — waiting ${Math.round(wait / 1000)}s`);
    await new Promise((r) => setTimeout(r, wait));
  }
  _lastCallAt = Date.now();
}

export function createOpenRouterClient(opts = {}) {
  // Local endpoints (Ollama) accept any bearer token — no key required.
  const apiKey =
    opts.apiKey ?? process.env.OPENROUTER_API_KEY ?? (IS_LOCAL ? "ollama" : null);
  const fetchImpl = opts.fetch ?? globalThis.fetch;
  const baseModel = opts.model ?? process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL;
  const referer = opts.referer ?? "https://github.com/jaf107/RepairA11y";
  const title = opts.title ?? "RepairA11y";
  // Local inference on laptop hardware can take minutes per response.
  const fetchTimeoutMs = opts.fetchTimeoutMs ?? (IS_LOCAL ? 300_000 : 60_000);

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
    images, // optional array of base64 PNG strings, attached as image parts
  }) {
    if (!apiKey) {
      throw new OpenRouterError(
        "OPENROUTER_API_KEY not set — set env var or pass opts.apiKey",
      );
    }
    await _throttle();
    let url, body;
    if (IS_LOCAL) {
      // Native Ollama request shape.
      body = {
        model,
        messages: [
          {
            role: "user",
            content: prompt,
            ...(images?.length > 0 ? { images } : {}),
          },
        ],
        stream: false,
        think: false,
        keep_alive: "2h",
        options: {
          temperature,
          num_predict: maxTokens,
          num_ctx: LOCAL_NUM_CTX,
          ...(seed != null ? { seed } : {}),
        },
        ...(responseFormat ? { format: "json" } : {}),
      };
      url = NATIVE_ENDPOINT;
    } else {
      const content =
        images?.length > 0
          ? [
              { type: "text", text: prompt },
              ...images.map((b64) => ({
                type: "image_url",
                image_url: { url: `data:image/png;base64,${b64}` },
              })),
            ]
          : prompt;
      body = {
        model,
        messages: [{ role: "user", content }],
        temperature,
        max_tokens: maxTokens,
      };
      if (seed != null) body.seed = seed;
      if (responseFormat) body.response_format = responseFormat;
      url = ENDPOINT;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), fetchTimeoutMs);
    let res;
    try {
      res = await fetchImpl(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": referer,
          "X-Title": title,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      if (err.name === "AbortError") {
        throw new OpenRouterError(
          `OpenRouter request timed out after ${fetchTimeoutMs / 1000}s`,
          { status: 408, retryable: true },
        );
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }

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
    if (IS_LOCAL) {
      // Native Ollama response shape.
      if (!data.message) {
        throw new OpenRouterError("Ollama response missing message", { data });
      }
      return {
        text: data.message.content ?? "",
        model: data.model ?? model,
        usage: {
          prompt_tokens: data.prompt_eval_count ?? null,
          completion_tokens: data.eval_count ?? null,
        },
        raw: data,
      };
    }
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
