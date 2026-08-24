import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getImageProvider, generateWithRetry, ImageGenerationError } from "./imageProviders";
import { getStyle } from "./styles";

/**
 * Contract tests for the image providers.
 *
 * These cannot prove a remote API behaves as documented — only a real key can
 * do that. What they do pin down is our half of the contract: the request body
 * we send, the response shape we read, and how we behave when a call fails.
 * That is the part that silently rots, and the part a benchmark run would
 * otherwise be the first to discover.
 */

const style = getStyle("ligne-claire");
const PNG_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const PNG_BASE64 = "iVBORw0KGgo=";

interface Call {
  url: string;
  init?: RequestInit;
}

let calls: Call[];

/** Stands in for the network. Routes by URL so one mock serves every provider. */
function mockFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  vi.stubGlobal("fetch", (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push({ url, init });
    return Promise.resolve(handler(url, init));
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function imageResponse(): Response {
  return new Response(PNG_BYTES, { status: 200, headers: { "Content-Type": "image/png" } });
}

function bodyOf(call: Call): Record<string, unknown> {
  return JSON.parse(call.init?.body as string);
}

beforeEach(() => {
  calls = [];
  // The shared modules read configuration through Deno.env.
  vi.stubGlobal("Deno", {
    env: {
      get: (key: string) =>
        ({
          FAL_KEY: "fal-test-key",
          GEMINI_API_KEY: "gemini-test-key",
          OPENAI_API_KEY: "openai-test-key",
        })[key],
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fal provider", () => {
  it("authenticates with the Key scheme, not Bearer", async () => {
    mockFetch((url) =>
      url.startsWith("https://fal.run/")
        ? jsonResponse({ images: [{ url: "https://cdn.fal/img.png", content_type: "image/png" }] })
        : imageResponse()
    );

    const provider = getImageProvider({ provider: "fal", model: "fal-ai/flux-2/pro" });
    await provider.generate({ prompt: "a cat", style });

    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Key fal-test-key");
  });

  it("downloads the image the API points at, rather than returning the URL", async () => {
    mockFetch((url) =>
      url.startsWith("https://fal.run/")
        ? jsonResponse({ images: [{ url: "https://cdn.fal/img.png", content_type: "image/png" }] })
        : imageResponse()
    );

    const provider = getImageProvider({ provider: "fal", model: "fal-ai/flux-2/pro" });
    const result = await provider.generate({ prompt: "a cat", style });

    expect(calls).toHaveLength(2);
    expect(calls[1].url).toBe("https://cdn.fal/img.png");
    expect(result.bytes).toEqual(PNG_BYTES);
    expect(result.costUsd).toBeGreaterThan(0);
  });

  it("sends a LoRA only to a model family that accepts one", async () => {
    mockFetch((url) =>
      url.startsWith("https://fal.run/")
        ? jsonResponse({ images: [{ url: "https://cdn.fal/img.png" }] })
        : imageResponse()
    );

    const styled = { ...style, lora: { path: "me/my-style", scale: 0.9 } };

    const flux = getImageProvider({ provider: "fal", model: "fal-ai/flux-2/pro" });
    await flux.generate({ prompt: "x", style: styled });
    expect(bodyOf(calls[0]).loras).toEqual([{ path: "me/my-style", scale: 0.9 }]);

    calls = [];
    const banana = getImageProvider({ provider: "fal", model: "fal-ai/nano-banana" });
    await banana.generate({ prompt: "x", style: styled });
    expect(bodyOf(calls[0]).loras).toBeUndefined();
  });

  it("folds exclusions into the prompt when the endpoint has no negative field", async () => {
    mockFetch((url) =>
      url.startsWith("https://fal.run/")
        ? jsonResponse({ images: [{ url: "https://cdn.fal/img.png" }] })
        : imageResponse()
    );

    const flux = getImageProvider({ provider: "fal", model: "fal-ai/flux-2/pro" });
    await flux.generate({ prompt: "a cat", style });

    const body = bodyOf(calls[0]);
    expect(body.negative_prompt).toBeUndefined();
    expect(String(body.prompt)).toContain("Do not include:");
  });

  it("uses the named size preset for models that do not take an aspect ratio", async () => {
    mockFetch((url) =>
      url.startsWith("https://fal.run/")
        ? jsonResponse({ images: [{ url: "https://cdn.fal/img.png" }] })
        : imageResponse()
    );

    const flux = getImageProvider({ provider: "fal", model: "fal-ai/flux-2/pro" });
    await flux.generate({ prompt: "x", style, aspectRatio: "9:16" });
    expect(bodyOf(calls[0]).image_size).toBe("portrait_16_9");

    calls = [];
    const ideogram = getImageProvider({ provider: "fal", model: "fal-ai/ideogram/v3" });
    await ideogram.generate({ prompt: "x", style, aspectRatio: "9:16" });
    expect(bodyOf(calls[0]).aspect_ratio).toBe("9:16");
    expect(bodyOf(calls[0]).image_size).toBeUndefined();
  });

  it("fails loudly when the response carries no image", async () => {
    mockFetch(() => jsonResponse({ images: [] }));
    const provider = getImageProvider({ provider: "fal", model: "fal-ai/flux-2/pro" });
    await expect(provider.generate({ prompt: "x", style })).rejects.toThrow(/no image/i);
  });
});

describe("Gemini provider", () => {
  it("reads the image whether the field is camelCase or snake_case", async () => {
    for (const part of [
      { inlineData: { data: PNG_BASE64, mimeType: "image/png" } },
      { inline_data: { data: PNG_BASE64, mime_type: "image/png" } },
    ]) {
      calls = [];
      mockFetch(() => jsonResponse({ candidates: [{ content: { parts: [part] } }] }));

      const provider = getImageProvider({ provider: "gemini", model: "gemini-2.5-flash-image" });
      const result = await provider.generate({ prompt: "x", style });
      expect(result.bytes).toEqual(PNG_BYTES);
    }
  });

  it("passes the aspect ratio through generationConfig and asks for an image", async () => {
    mockFetch(() =>
      jsonResponse({ candidates: [{ content: { parts: [{ inlineData: { data: PNG_BASE64 } }] } }] })
    );

    const provider = getImageProvider({ provider: "gemini", model: "gemini-2.5-flash-image" });
    await provider.generate({ prompt: "x", style, aspectRatio: "9:16" });

    const body = bodyOf(calls[0]);
    const config = body.generationConfig as Record<string, unknown>;
    expect(config.responseModalities).toEqual(["IMAGE"]);
    expect(config.imageConfig).toEqual({ aspectRatio: "9:16" });
  });

  it("authenticates with the API key header, never a query string", async () => {
    mockFetch(() =>
      jsonResponse({ candidates: [{ content: { parts: [{ inlineData: { data: PNG_BASE64 } }] } }] })
    );

    const provider = getImageProvider({ provider: "gemini", model: "gemini-2.5-flash-image" });
    await provider.generate({ prompt: "x", style });

    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers["x-goog-api-key"]).toBe("gemini-test-key");
    // A key in the URL leaks into logs and proxies.
    expect(calls[0].url).not.toContain("gemini-test-key");
  });
});

describe("OpenAI provider", () => {
  it("decodes the base64 payload and requests a portrait size", async () => {
    mockFetch(() => jsonResponse({ data: [{ b64_json: PNG_BASE64 }] }));

    const provider = getImageProvider({ provider: "openai", model: "gpt-image-1" });
    const result = await provider.generate({ prompt: "x", style, aspectRatio: "9:16" });

    expect(result.bytes).toEqual(PNG_BYTES);
    expect(bodyOf(calls[0]).size).toBe("1024x1536");
  });
});

describe("provider selection", () => {
  it("rejects an unknown provider instead of falling back silently", () => {
    expect(() => getImageProvider({ provider: "midjourney", model: "x" })).toThrow(/Unknown image provider/);
  });

  it("reports which providers can serve a custom LoRA", () => {
    expect(getImageProvider({ provider: "fal", model: "fal-ai/flux-2/pro" }).supportsLora).toBe(true);
    expect(getImageProvider({ provider: "openai", model: "gpt-image-1" }).supportsLora).toBe(false);
    expect(getImageProvider({ provider: "gemini", model: "gemini-2.5-flash-image" }).supportsLora).toBe(false);
  });
});

describe("retry behaviour", () => {
  it("retries a rate limit and succeeds on a later attempt", async () => {
    let attempt = 0;
    mockFetch((url) => {
      if (!url.startsWith("https://fal.run/")) return imageResponse();
      attempt++;
      return attempt === 1
        ? jsonResponse({ error: "rate limited" }, 429)
        : jsonResponse({ images: [{ url: "https://cdn.fal/img.png" }] });
    });

    const provider = getImageProvider({ provider: "fal", model: "fal-ai/flux-2/pro" });
    const result = await generateWithRetry(provider, { prompt: "x", style });

    expect(attempt).toBe(2);
    expect(result.bytes).toEqual(PNG_BYTES);
  });

  it("does not retry a refused prompt — a 400 will never become a 200", async () => {
    let attempt = 0;
    mockFetch(() => {
      attempt++;
      return jsonResponse({ error: "content policy" }, 400);
    });

    const provider = getImageProvider({ provider: "fal", model: "fal-ai/flux-2/pro" });
    await expect(generateWithRetry(provider, { prompt: "x", style })).rejects.toThrow(
      ImageGenerationError
    );
    expect(attempt).toBe(1);
  });
});
