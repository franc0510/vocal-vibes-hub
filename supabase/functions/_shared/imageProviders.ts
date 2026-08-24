/**
 * Image generation behind a single interface.
 *
 * The point of this file is that choosing a model is a configuration change,
 * not a rewrite. The benchmark script and the illustrate-story function both
 * go through `getImageProvider()`, so whatever wins the benchmark ships by
 * setting IMAGE_PROVIDER / IMAGE_MODEL.
 *
 * Note that only the fal provider can serve a custom-trained LoRA. If we ever
 * train our illustrator's style (phase C of the art plan), the provider has to
 * be fal — that constraint is the reason this abstraction exists at all.
 */

import type { StyleBible } from "./styles.ts";

export type AspectRatio = "9:16" | "1:1" | "16:9";

export interface GenerateImageInput {
  prompt: string;
  style: StyleBible;
  aspectRatio?: AspectRatio;
  seed?: number;
}

export interface GenerateImageResult {
  bytes: Uint8Array;
  contentType: string;
  model: string;
  costUsd: number;
  latencyMs: number;
}

export interface ImageProvider {
  id: string;
  model: string;
  supportsLora: boolean;
  generate(input: GenerateImageInput): Promise<GenerateImageResult>;
}

/**
 * List price per ~1MP image, USD, as surveyed in August 2026. Used for
 * accounting and for the benchmark's cost column — it is an estimate, not a
 * bill. Re-check against the provider's own pricing page before trusting it.
 */
const PRICE_PER_IMAGE_USD: Record<string, number> = {
  "fal-ai/flux/schnell": 0.003,
  "fal-ai/flux-2/klein": 0.014,
  "fal-ai/flux-2/pro": 0.03,
  "fal-ai/flux-2/max": 0.07,
  "fal-ai/qwen-image": 0.02,
  "fal-ai/bytedance/seedream/v4/text-to-image": 0.03,
  "fal-ai/ideogram/v3": 0.03,
  "fal-ai/nano-banana": 0.039,
  "gemini-2.5-flash-image": 0.039,
  "gemini-3-pro-image-preview": 0.134,
  "gpt-image-1": 0.02,
};

function priceOf(model: string): number {
  return PRICE_PER_IMAGE_USD[model] ?? 0;
}

// ---------------------------------------------------------------- utilities

export class ImageGenerationError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "ImageGenerationError";
  }
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Chunked on purpose: spreading a whole image into fromCharCode overflows the stack. */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

const RETRYABLE = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

/** Retries only on transient failures. A refused prompt must fail immediately. */
async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const status = err instanceof ImageGenerationError ? err.status : undefined;
      const retryable = status === undefined || RETRYABLE.has(status);
      if (!retryable || i === attempts - 1) break;
      await new Promise((r) => setTimeout(r, 800 * 2 ** i));
    }
  }
  throw lastError;
}

async function fetchImageBytes(url: string): Promise<{ bytes: Uint8Array; contentType: string }> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new ImageGenerationError(`Could not download generated image: ${res.status}`, res.status);
  }
  return {
    bytes: new Uint8Array(await res.arrayBuffer()),
    contentType: res.headers.get("content-type") ?? "image/jpeg",
  };
}

// ------------------------------------------------------------------- fal.ai

const FAL_IMAGE_SIZE: Record<AspectRatio, string> = {
  "9:16": "portrait_16_9",
  "1:1": "square_hd",
  "16:9": "landscape_16_9",
};

/**
 * fal endpoints do not share one schema — several reject unknown fields
 * outright, so we only send what a given family actually accepts.
 * `aspectRatio` here means the endpoint wants `aspect_ratio: "9:16"` rather
 * than fal's named `image_size` presets.
 */
interface FalCapabilities {
  negativePrompt: boolean;
  lora: boolean;
  referenceImages: boolean;
  aspectRatio: boolean;
}

function falCapabilities(model: string): FalCapabilities {
  if (model.startsWith("fal-ai/nano-banana")) {
    return { negativePrompt: false, lora: false, referenceImages: true, aspectRatio: true };
  }
  if (model.startsWith("fal-ai/flux-2")) {
    return { negativePrompt: false, lora: true, referenceImages: true, aspectRatio: false };
  }
  if (model.startsWith("fal-ai/flux")) {
    return { negativePrompt: false, lora: true, referenceImages: false, aspectRatio: false };
  }
  if (model.startsWith("fal-ai/ideogram")) {
    return { negativePrompt: true, lora: false, referenceImages: false, aspectRatio: true };
  }
  if (model.includes("seedream")) {
    return { negativePrompt: false, lora: false, referenceImages: true, aspectRatio: false };
  }
  // Qwen and anything new: the conservative set.
  return { negativePrompt: true, lora: false, referenceImages: false, aspectRatio: false };
}

function falProvider(model: string): ImageProvider {
  const apiKey = Deno.env.get("FAL_KEY");
  if (!apiKey) throw new Error("Missing FAL_KEY");
  const caps = falCapabilities(model);

  return {
    id: "fal",
    model,
    supportsLora: caps.lora,
    async generate({ prompt, style, aspectRatio = "9:16", seed }) {
      const startedAt = Date.now();

      const body: Record<string, unknown> = { prompt, num_images: 1 };
      if (caps.aspectRatio) body.aspect_ratio = aspectRatio;
      else body.image_size = FAL_IMAGE_SIZE[aspectRatio];

      if (seed !== undefined) body.seed = seed;
      // Where the endpoint has no negative-prompt field, the exclusions still
      // have to reach the model — so they ride inside the prompt instead.
      if (style.negative) {
        if (caps.negativePrompt) body.negative_prompt = style.negative;
        else body.prompt = `${prompt}\n\nDo not include: ${style.negative}`;
      }
      if (caps.lora && style.lora) body.loras = [{ path: style.lora.path, scale: style.lora.scale }];
      if (caps.referenceImages && style.referenceImages.length > 0) {
        body.image_urls = style.referenceImages;
      }

      const res = await fetch(`https://fal.run/${model}`, {
        method: "POST",
        headers: { Authorization: `Key ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        throw new ImageGenerationError(`fal ${model} failed: ${await res.text()}`, res.status);
      }

      const json = await res.json();
      const url = json?.images?.[0]?.url;
      if (!url) throw new ImageGenerationError(`fal ${model} returned no image`);

      const { bytes, contentType } = await fetchImageBytes(url);
      return {
        bytes,
        contentType: json?.images?.[0]?.content_type ?? contentType,
        model,
        costUsd: priceOf(model),
        latencyMs: Date.now() - startedAt,
      };
    },
  };
}

// ------------------------------------------------------------------- Gemini

function geminiProvider(model: string): ImageProvider {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

  return {
    id: "gemini",
    model,
    supportsLora: false,
    async generate({ prompt, style, aspectRatio = "9:16" }) {
      const startedAt = Date.now();

      // Gemini has no negative-prompt field, so the exclusions have to ride
      // along inside the prompt itself.
      const fullPrompt = style.negative ? `${prompt}\n\nDo not include: ${style.negative}` : prompt;

      const parts: Record<string, unknown>[] = [{ text: fullPrompt }];
      for (const refUrl of style.referenceImages) {
        const { bytes, contentType } = await fetchImageBytes(refUrl);
        parts.push({
          inline_data: { mime_type: contentType, data: bytesToBase64(bytes) },
        });
      }

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: {
              responseModalities: ["IMAGE"],
              imageConfig: { aspectRatio },
            },
          }),
        }
      );

      if (!res.ok) {
        throw new ImageGenerationError(`Gemini ${model} failed: ${await res.text()}`, res.status);
      }

      // The REST API has shipped both camelCase and snake_case spellings of
      // this field, so read whichever one came back.
      interface GeminiPart {
        inlineData?: { data?: string; mimeType?: string };
        inline_data?: { data?: string; mime_type?: string };
      }

      const json = await res.json();
      const candidateParts: GeminiPart[] = json?.candidates?.[0]?.content?.parts ?? [];
      const imagePart = candidateParts.find((p) => p?.inlineData?.data ?? p?.inline_data?.data);
      const b64 = imagePart?.inlineData?.data ?? imagePart?.inline_data?.data;
      if (!b64) throw new ImageGenerationError(`Gemini ${model} returned no image`);

      return {
        bytes: base64ToBytes(b64),
        contentType: imagePart?.inlineData?.mimeType ?? imagePart?.inline_data?.mime_type ?? "image/png",
        model,
        costUsd: priceOf(model),
        latencyMs: Date.now() - startedAt,
      };
    },
  };
}

// ------------------------------------------------------------------- OpenAI

const OPENAI_SIZE: Record<AspectRatio, string> = {
  "9:16": "1024x1536",
  "1:1": "1024x1024",
  "16:9": "1536x1024",
};

function openaiProvider(model: string): ImageProvider {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  return {
    id: "openai",
    model,
    supportsLora: false,
    async generate({ prompt, style, aspectRatio = "9:16" }) {
      const startedAt = Date.now();

      const fullPrompt = style.negative ? `${prompt}\n\nAvoid: ${style.negative}` : prompt;

      const res = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          prompt: fullPrompt,
          size: OPENAI_SIZE[aspectRatio],
          n: 1,
        }),
      });

      if (!res.ok) {
        throw new ImageGenerationError(`OpenAI ${model} failed: ${await res.text()}`, res.status);
      }

      const json = await res.json();
      const b64 = json?.data?.[0]?.b64_json;
      if (!b64) throw new ImageGenerationError(`OpenAI ${model} returned no image`);

      return {
        bytes: base64ToBytes(b64),
        contentType: "image/png",
        model,
        costUsd: priceOf(model),
        latencyMs: Date.now() - startedAt,
      };
    },
  };
}

// ------------------------------------------------------------------ factory

const DEFAULT_MODEL: Record<string, string> = {
  fal: "fal-ai/flux-2/pro",
  gemini: "gemini-2.5-flash-image",
  openai: "gpt-image-1",
};

export function getImageProvider(opts?: { provider?: string; model?: string }): ImageProvider {
  const id = opts?.provider ?? Deno.env.get("IMAGE_PROVIDER") ?? "fal";
  const model = opts?.model ?? Deno.env.get("IMAGE_MODEL") ?? DEFAULT_MODEL[id];

  if (!model) throw new Error(`No model configured for image provider "${id}"`);

  switch (id) {
    case "fal":
      return falProvider(model);
    case "gemini":
      return geminiProvider(model);
    case "openai":
      return openaiProvider(model);
    default:
      throw new Error(`Unknown image provider "${id}". Expected fal, gemini or openai.`);
  }
}

/** Wraps a provider call with transient-failure retries. */
export function generateWithRetry(
  provider: ImageProvider,
  input: GenerateImageInput
): Promise<GenerateImageResult> {
  return withRetry(() => provider.generate(input));
}
