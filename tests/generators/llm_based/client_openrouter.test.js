import { describe, it, expect, vi } from "vitest";
import {
  createOpenRouterClient,
  tryParseJson,
  OpenRouterError,
} from "../../../src/generators/llm_based/client_openrouter.js";

describe("tryParseJson", () => {
  it("parses straight JSON", () => {
    expect(tryParseJson('{"a":1}')).toEqual({ a: 1 });
  });
  it("strips ```json fenced block", () => {
    expect(tryParseJson("```json\n{\"a\":1}\n```")).toEqual({ a: 1 });
  });
  it("strips plain ``` fenced block", () => {
    expect(tryParseJson("```\n{\"a\":1}\n```")).toEqual({ a: 1 });
  });
  it("recovers first {...} blob from chatter", () => {
    expect(
      tryParseJson("Sure, here it is:\n{\"a\":1, \"b\": \"x\"}\nLet me know!"),
    ).toEqual({ a: 1, b: "x" });
  });
  it("returns null on garbage", () => {
    expect(tryParseJson("nope")).toBe(null);
  });
});

describe("createOpenRouterClient — auth + fetch shape", () => {
  it("throws if no API key", async () => {
    const client = createOpenRouterClient({ fetch: vi.fn() });
    await expect(client.complete({ prompt: "x" })).rejects.toBeInstanceOf(
      OpenRouterError,
    );
  });

  it("sends Authorization and HTTP-Referer headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "hi" } }],
        model: "test",
      }),
    });
    const client = createOpenRouterClient({
      fetch: fetchMock,
      apiKey: "sk-test",
    });
    await client.complete({ prompt: "hi" });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBe("Bearer sk-test");
    expect(init.headers["HTTP-Referer"]).toBeTruthy();
  });

  it("throws OpenRouterError with status on non-retryable 4xx", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "unauthorized",
    });
    const client = createOpenRouterClient({
      fetch: fetchMock,
      apiKey: "sk-test",
    });
    await expect(client.complete({ prompt: "hi" })).rejects.toMatchObject({
      name: "OpenRouterError",
      status: 401,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1); // not retried
  });

  it("throws immediately on 429 when retries disabled", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => "rate limit",
    });
    const client = createOpenRouterClient({
      fetch: fetchMock,
      apiKey: "sk-test",
      maxRetries: 0,
    });
    await expect(client.complete({ prompt: "hi" })).rejects.toMatchObject({
      name: "OpenRouterError",
      status: 429,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("createOpenRouterClient — retry/backoff on transient failures", () => {
  const noSleep = () => Promise.resolve();

  it("retries a 429 then succeeds (this is the gemma bug)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 429, text: async () => "rl" })
      .mockResolvedValueOnce({ ok: false, status: 429, text: async () => "rl" })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: "hi" } }],
          model: "test",
        }),
      });
    const client = createOpenRouterClient({
      fetch: fetchMock,
      apiKey: "sk-test",
      sleep: noSleep,
    });
    const out = await client.complete({ prompt: "hi" });
    expect(out.text).toBe("hi");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("exhausts retries on persistent 429 and throws with status", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 429, text: async () => "rl" });
    const client = createOpenRouterClient({
      fetch: fetchMock,
      apiKey: "sk-test",
      maxRetries: 2,
      sleep: noSleep,
    });
    await expect(client.complete({ prompt: "hi" })).rejects.toMatchObject({
      status: 429,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3); // 1 + 2 retries
  });

  it("retries network errors then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: "ok" } }],
          model: "test",
        }),
      });
    const client = createOpenRouterClient({
      fetch: fetchMock,
      apiKey: "sk-test",
      sleep: noSleep,
    });
    const out = await client.complete({ prompt: "hi" });
    expect(out.text).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("paces requests by minIntervalMs (throttle / batch pacing)", async () => {
    let clock = 0;
    const sleeps = [];
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "ok" } }],
        model: "test",
      }),
    });
    const client = createOpenRouterClient({
      fetch: fetchMock,
      apiKey: "sk-test",
      minIntervalMs: 4000,
      now: () => clock,
      sleep: (ms) => {
        sleeps.push(ms);
        clock += ms; // advance virtual clock by the slept time
        return Promise.resolve();
      },
    });
    await client.complete({ prompt: "a" }); // first call: no wait
    await client.complete({ prompt: "b" }); // second: must wait full interval
    expect(sleeps).toEqual([4000]);
  });

  it("honors Retry-After header for delay", async () => {
    const sleeps = [];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => "rl",
        headers: { get: (h) => (h === "retry-after" ? "2" : null) },
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: "ok" } }],
          model: "test",
        }),
      });
    const client = createOpenRouterClient({
      fetch: fetchMock,
      apiKey: "sk-test",
      sleep: (ms) => {
        sleeps.push(ms);
        return Promise.resolve();
      },
    });
    await client.complete({ prompt: "hi" });
    expect(sleeps[0]).toBe(2000); // 2s from Retry-After
  });
});

describe("createOpenRouterClient.completeJson", () => {
  it("returns parsed json on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"patch_type":"css_inject"}' } }],
        model: "test",
      }),
    });
    const client = createOpenRouterClient({
      fetch: fetchMock,
      apiKey: "sk-test",
    });
    const out = await client.completeJson({ prompt: "x" });
    expect(out.json).toEqual({ patch_type: "css_inject" });
  });

  it("retries up to maxAttempts on invalid JSON, then throws", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "not json at all" } }],
        model: "test",
      }),
    });
    const client = createOpenRouterClient({
      fetch: fetchMock,
      apiKey: "sk-test",
    });
    await expect(
      client.completeJson({ prompt: "x", maxAttempts: 2 }),
    ).rejects.toMatchObject({ name: "OpenRouterError" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
