/**
 * Gives a transcription to the anecdotes published before there was one.
 *
 * Automatic transcription only started working recently, so most of the back
 * catalogue has none — and in the app that means no caption block, no
 * timestamps, and nothing to build a storyboard from later.
 *
 * This walks the posts that are missing it and fills the gap. Whisper only:
 * no images, no video, nothing generated beyond the words that were already
 * spoken.
 *
 *   npx tsx scripts/backfill-transcriptions.ts            # compte, n'écrit rien
 *   npx tsx scripts/backfill-transcriptions.ts --yes      # transcrit
 *   npx tsx scripts/backfill-transcriptions.ts --yes --limit 5
 */

import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveEnv } from "./lib/env.js";

const shimTarget = globalThis as typeof globalThis & {
  Deno?: { env: { get(key: string): string | undefined } };
};
shimTarget.Deno ??= { env: { get: (key: string) => process.env[key] } };

const HERE = dirname(fileURLToPath(import.meta.url));
const SHARED = join(HERE, "..", "supabase", "functions", "_shared");

interface Post {
  id: string;
  title: string;
  audio_url: string;
  duration: number;
  duration_ms: number | null;
  transcription: string | null;
  transcription_segments: unknown;
}

const FIELDS = "id,title,audio_url,duration,duration_ms,transcription,transcription_segments";

/**
 * fal bills Whisper by the minute of audio. Kept as a named constant so the
 * estimate printed before writing cannot drift away from the one in the code.
 */
const COST_PER_MINUTE_USD = 0.0006;

let cached: { url: string; key: string } | null = null;

async function config() {
  if (cached) return cached;
  const url = await resolveEnv("SUPABASE_URL", "VITE_SUPABASE_URL");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("URL Supabase introuvable — attendue dans .env.");
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY manquante.\n" +
        "La clé publique ne suffit pas : ce script écrit dans des posts."
    );
  }
  cached = { url: url.replace(/\/$/, ""), key };
  return cached;
}

async function rest(path: string, init: RequestInit = {}) {
  const { url, key } = await config();
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`${path} → ${res.status} ${body}`);
  // A PATCH with return=minimal answers 204 and sends nothing.
  return body.trim() === "" ? null : JSON.parse(body);
}

/** Missing text, or text without the timestamps everything downstream needs. */
function needsWork(p: Post): boolean {
  const hasText = Boolean(p.transcription?.trim());
  const hasSegments = Array.isArray(p.transcription_segments) && p.transcription_segments.length > 0;
  return !hasText || !hasSegments;
}

async function main() {
  const argv = process.argv.slice(2);
  const write = argv.includes("--yes");
  const limitAt = argv.indexOf("--limit");
  const limit = limitAt >= 0 && argv[limitAt + 1] ? Number(argv[limitAt + 1]) : Infinity;

  const { transcribe, realDurationMs } = await import(join(SHARED, "transcribe.ts"));

  const all = (await rest(`voice_posts?select=${FIELDS}&limit=1000`)) as Post[];
  const todo = all.filter(needsWork).slice(0, limit);

  const seconds = todo.reduce((sum, p) => sum + (p.duration || 0), 0);
  console.log(`\n${all.length} anecdotes au total.`);
  console.log(`${todo.length} sans transcription complète — ${Math.round(seconds / 60)} min d'audio.`);
  console.log(`Coût estimé : ${(seconds / 60) * COST_PER_MINUTE_USD < 0.01 ? "moins d'un centime" : `~${((seconds / 60) * COST_PER_MINUTE_USD).toFixed(3)} $`}.`);
  console.log("Seule la parole est transcrite : aucune image, aucune vidéo.\n");

  if (todo.length === 0) return;

  if (!write) {
    for (const p of todo.slice(0, 10)) console.log(`  • ${p.title}`);
    if (todo.length > 10) console.log(`  … et ${todo.length - 10} autres`);
    console.log("\nRelance avec --yes pour transcrire.\n");
    return;
  }

  let done = 0;
  let failed = 0;

  for (const p of todo) {
    process.stdout.write(`▸ ${p.title} … `);
    try {
      const result = await transcribe({ audioUrl: p.audio_url });

      // duration_ms is filled in at the same time: the measured end of speech
      // is what stops a generated video clipping the closing words, and this
      // is the only moment we hold that number for an old post.
      const patch: Record<string, unknown> = {
        transcription: result.text,
        transcription_segments: result.segments.length > 0 ? result.segments : null,
      };
      if (!p.duration_ms && result.segments.length > 0) {
        patch.duration_ms = realDurationMs(p.duration, result.segments, p.duration_ms);
      }

      await rest(`voice_posts?id=eq.${p.id}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(patch),
      });

      console.log(`${result.segments.length} segments (${result.provider})`);
      done += 1;
    } catch (err) {
      // One unreadable recording must not strand the rest of the catalogue.
      console.log(`échec — ${err instanceof Error ? err.message : String(err)}`);
      failed += 1;
    }
  }

  console.log(`\n${done} transcrite(s)${failed ? `, ${failed} en échec` : ""}.\n`);
}

const runDirectly = !!process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (runDirectly) {
  main().catch((err) => {
    console.error(`\n${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  });
}

export { needsWork };
