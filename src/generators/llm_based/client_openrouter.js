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

// Transient transport failures worth retrying. 429 = upstream rate limit
// (very common on free-tier models); 5xx = provider hiccup. A 4xx other than
// 429 (e.g. 400/401/403) is a hard error — never retried.
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Honor an HTTP `Retry-After: <seconds>` header if present; else null. */
function parseRetryAfterMs(res) {
  const raw = res?.headers?.get?.("retry-after");
  if (!raw) return null;
  const secs = Number(raw);
  return Number.isFinite(secs) && secs >= 0 ? secs * 1000 : null;
}

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
  // Retry config for transient transport failures (429/5xx/network). These are
  // additional attempts after the first; set maxRetries:0 to disable.
  const maxRetries = opts.maxRetries ?? 4;
  const retryBaseMs = opts.retryBaseMs ?? 500;
  const sleep = opts.sleep ?? defaultSleep;
  const now = opts.now ?? (() => Date.now());
  // Throttle: minimum spacing between outbound requests, to stay under free-tier
  // per-minute quotas (the "batch-wise pacing" lever). 0 = no throttle.
  // Override via OPENROUTER_MIN_INTERVAL_MS env (e.g. 4000 = ~15 req/min).
  const minIntervalMs =
    opts.minIntervalMs ?? Number(process.env.OPENROUTER_MIN_INTERVAL_MS ?? 0);

  // Serialized gate: each request waits until at least minIntervalMs has elapsed
  // since the previous request started. Chained so concurrent callers queue.
  let gateChain = Promise.resolve();
  let lastStart = -Infinity; // first request never waits
  function pace() {
    if (!minIntervalMs) return Promise.resolve();
    gateChain = gateChain.then(async () => {
      const wait = Math.max(0, lastStart + minIntervalMs - now());
      if (wait) await sleep(wait);
      lastStart = now();
    });
    return gateChain;
  }

  // Exponential backoff with full jitter: base * 2^attempt, randomized to
  // avoid thundering-herd retries across concurrent cases.
  function backoffMs(attempt) {
    const ceil = retryBaseMs * 2 ** attempt;
    return Math.floor(ceil / 2 + Math.random() * (ceil / 2));
  }

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

    const init = {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": referer,
        "X-Title": title,
      },
      body: JSON.stringify(body),
    };

    let lastErr;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      await pace(); // throttle before every attempt (incl. retries)
      let res;
      try {
        res = await fetchImpl(ENDPOINT, init);
      } catch (networkErr) {
        // Network-level failure (DNS, connection reset) — retryable.
        lastErr = new OpenRouterError(
          `OpenRouter network error: ${networkErr.message}`,
          { cause: networkErr },
        );
        if (attempt < maxRetries) {
          await sleep(backoffMs(attempt));
          continue;
        }
        throw lastErr;
      }

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        lastErr = new OpenRouterError(
          `OpenRouter HTTP ${res.status}: ${text.slice(0, 500)}`,
          { status: res.status, body: text },
        );
        if (RETRYABLE_STATUS.has(res.status) && attempt < maxRetries) {
          await sleep(parseRetryAfterMs(res) ?? backoffMs(attempt));
          continue;
        }
        throw lastErr;
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
    throw lastErr;
  }

  async function completeJson(reqOpts) {
    const { maxAttempts = 3, ...rest } = reqOpts;
    let lastErr;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const result = await complete({
        ...rest,
        responseFormat: { type: "json_object" },
      });
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
