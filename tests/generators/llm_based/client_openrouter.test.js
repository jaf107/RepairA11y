import { describe, it, expect, vi } from "vitest";
import {
  createOpenRouterClient,
  tryParseJson,
  OpenRouterError,
} from "../../../src/generators/llm_based/client_openrouter.js";

// The client's shared rate limiter persists across tests in this process;
// disable the wait so mocked-fetch tests don't blow their 5s timeouts.
process.env.OPENROUTER_RPM = "100000";

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

  it("throws OpenRouterError with status on non-2xx", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "server error",
    });
    const client = createOpenRouterClient({
      fetch: fetchMock,
      apiKey: "sk-test",
    });
    await expect(client.complete({ prompt: "hi" })).rejects.toMatchObject({
      name: "OpenRouterError",
      status: 500,
    });
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
