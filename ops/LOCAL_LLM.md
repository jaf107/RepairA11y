# Local LLM setup (zero-cost, rate-limit-free)

All LLM experiments run against a local Ollama server instead of
OpenRouter's free tier (which throttles heavily and withdraws models).

```bash
brew install ollama
brew services start ollama
ollama pull gemma4:12b
```

`.env`:
```
LLM_ENDPOINT=http://localhost:11434/v1/chat/completions
OPENROUTER_MODEL=gemma4:12b
```

When the endpoint is localhost, the client talks to Ollama's NATIVE
`/api/chat` (not the OpenAI-compat layer), because the native API supports:

- `think: false` — gemma4 is a thinking model; via the compat layer it
  burns `max_tokens` on hidden reasoning and returns empty `content`.
- `format: "json"` — strict JSON grammar enforcement.
- `options.num_ctx` per request (`LLM_NUM_CTX`, default 16384) — Ollama's
  default 4096-token context silently truncates E3 evidence prompts.
- `keep_alive: "2h"` — avoids ~60s model reloads between Playwright phases.

Other client behavior on local endpoints: RPM throttle disabled, API key
not required, fetch timeout raised to 300s. The model is multimodal: E4
bundles attach the annotated element crop as a real image part
(`message.images` in the native API).

Reproducibility: weights pinned by Ollama digest (`ollama list` shows the
ID), temperature 0, per-trial fixed seeds.
