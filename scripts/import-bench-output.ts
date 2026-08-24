/**
 * Imports panels a benchmark run already produced into the app.
 *
 * The images are the expensive part and they are already paid for, so this
 * never regenerates them. It uploads what exists, places the panels in time,
 * and pays only for the video composition — about a cent an anecdote.
 *
 *   npx tsx scripts/import-bench-output.ts --dir ./bench-output --model nano_banana
 *
 * Needs SUPABASE_SERVICE_ROLE_KEY: it writes to posts it does not own.
 */

import { readFile, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const shimTarget = globalThis as typeof globalThis & {
  Deno?: { env: { get(key: string): string | undefined } };
};
shimTarget.Deno ??= { env: { get: (key: string) => process.env[key] } };

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const SHARED = join(ROOT, "supabase", "functions", "_shared");

interface Args {
  dir: string;
  model: string;
  titles?: string[];
  yes: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string, fallback?: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
  };
  return {
    dir: get("--dir", join(ROOT, "bench-output"))!,
    // Matched against the image filenames, which carry a sanitised model id.
    model: get("--model", "nano_banana")!,
    titles: get("--titles")?.split(";").map((s) => s.trim()).filter(Boolean),
    yes: argv.includes("--yes"),
    help: argv.includes("--help"),
  };
}

function usage() {
  console.log(`
Imports already-generated benchmark panels into the app.

  npx tsx scripts/import-bench-output.ts --yes

Options
  --dir <path>     Unzipped benchmark artifact (default ./bench-output).
  --model <id>     Which model's panels to import, as it appears in the image
                   filenames (default nano_banana).
  --titles "a;b"   Only these anecdotes. Default: everything the run covered.
  --yes            Actually write. Without it, nothing is uploaded.

Environment
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   Required — this writes to posts.
  FAL_KEY                                   Required, for the video only.

Panels are never regenerated: this uploads what the run already produced. The
only cost is composing the video, about $0.012 per anecdote.
`);
}

function supabaseConfig() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis.\n" +
        "La clé publique ne suffit pas : ce script écrit dans les posts."
    );
  }
  return { url: url.replace(/\/$/, ""), key };
}

async function rest(path: string, init: RequestInit = {}) {
  const { url, key } = supabaseConfig();
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`${path} → ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

async function uploadToBucket(bucket: string, path: string, body: Uint8Array, contentType: string) {
  const { url, key } = supabaseConfig();
  const res = await fetch(`${url}/storage/v1/object/${bucket}/${path}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": contentType,
      "x-upsert": "true",
    },
    body,
  });
  if (!res.ok) throw new Error(`upload ${bucket}/${path} → ${res.status} ${await res.text()}`);
  return `${url}/storage/v1/object/public/${bucket}/${path}`;
}

/** Anecdote titles in the order the run generated them — that order is the image index. */
async function anecdoteOrder(dir: string): Promise<string[]> {
  const csv = await readFile(join(dir, "results.csv"), "utf8");
  const seen: string[] = [];
  for (const line of csv.split("\n").slice(1)) {
    const match = line.match(/^"((?:[^"]|"")*)"/);
    if (!match) continue;
    const title = match[1].replace(/""/g, '"');
    if (title && !seen.includes(title)) seen.push(title);
  }
  return seen;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return usage();

  const { assignTimings, planPanelCount } = await import(join(SHARED, "storyboard.ts"));
  const { composeVideo } = await import(join(SHARED, "composeVideo.ts"));
  const { realDurationMs } = await import(join(SHARED, "transcribe.ts"));

  const order = await anecdoteOrder(args.dir);
  const wanted = args.titles
    ? order.filter((t) => args.titles!.some((q) => t.toLowerCase().includes(q.toLowerCase())))
    : order;

  if (wanted.length === 0) {
    throw new Error("Aucune anecdote à importer — vérifie --dir et --titles.");
  }

  const files = await readdir(join(args.dir, "images"));
  console.log(`\nDossier   : ${args.dir}`);
  console.log(`Modèle    : ${args.model}`);
  console.log(`Anecdotes : ${wanted.length}`);
  for (const t of wanted) console.log(`            • ${t}`);
  console.log(`\nLes planches ne sont PAS régénérées. Seule la vidéo est facturée (~0,012 $ pièce).\n`);

  if (!args.yes) {
    console.log("Relance avec --yes pour écrire réellement.\n");
    return;
  }

  for (const title of wanted) {
    const index = order.indexOf(title);
    console.log(`▸ ${title}`);

    const posts = (await rest(
      `voice_posts?select=id,user_id,title,duration,duration_ms,transcription_segments,audio_url&title=ilike.*${encodeURIComponent(
        title.replace(/[,()*]/g, " ").trim()
      )}*&limit=1`
    )) as {
      id: string;
      user_id: string;
      duration: number;
      duration_ms: number | null;
      transcription_segments: unknown;
      audio_url: string;
    }[];

    if (posts.length === 0) {
      console.log("  aucun post ne porte ce titre — ignoré");
      continue;
    }
    const post = posts[0];

    // Panels for this anecdote and this model, in order.
    const prefix = `${index}-`;
    const panelFiles = files
      .filter((f) => f.startsWith(prefix) && f.includes(args.model))
      .sort((a, b) => {
        const n = (f: string) => Number(f.match(/-(\d+)\.\w+$/)?.[1] ?? 0);
        return n(a) - n(b);
      });

    if (panelFiles.length === 0) {
      console.log(`  aucune planche ${args.model} trouvée — ignoré`);
      continue;
    }

    // Prefer the storyboard the run saved; older artifacts predate it, so the
    // timings are rebuilt from the recording instead.
    const segments = Array.isArray(post.transcription_segments)
      ? (post.transcription_segments as { start_ms: number; end_ms: number; text: string }[])
      : [];
    let timings: { start_ms: number; end_ms: number }[];
    try {
      const saved = JSON.parse(await readFile(join(args.dir, `storyboard-${index}.json`), "utf8"));
      timings = saved.storyboard.scenes.map((s: { start_ms: number; end_ms: number }) => ({
        start_ms: s.start_ms,
        end_ms: s.end_ms,
      }));
    } catch {
      timings = assignTimings(
        panelFiles.length,
        segments,
        realDurationMs(post.duration, segments, post.duration_ms)
      );
    }

    const totalMs = realDurationMs(post.duration, segments, post.duration_ms);

    const rows = [];
    for (const [idx, file] of panelFiles.entries()) {
      const bytes = new Uint8Array(await readFile(join(args.dir, "images", file)));
      const publicUrl = await uploadToBucket(
        "story_images",
        `${post.user_id}/${post.id}/${idx}.jpg`,
        bytes,
        "image/jpeg"
      );
      rows.push({
        post_id: post.id,
        idx,
        image_url: publicUrl,
        start_ms: timings[idx]?.start_ms ?? 0,
        end_ms: timings[idx]?.end_ms ?? totalMs,
        style_id: "ligne-claire",
        provider: "fal",
        model: args.model,
      });
      process.stdout.write(`\r  planches téléversées : ${idx + 1}/${panelFiles.length}`);
    }
    console.log("");

    await rest("post_illustrations?on_conflict=post_id,idx", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(rows),
    });

    process.stdout.write("  composition de la vidéo… ");
    const composed = await composeVideo({
      panels: rows.map((r) => ({ imageUrl: r.image_url, start_ms: r.start_ms, end_ms: r.end_ms })),
      audioUrl: post.audio_url,
      totalMs,
    });

    const videoBytes = new Uint8Array(await (await fetch(composed.videoUrl)).arrayBuffer());
    const videoUrl = await uploadToBucket(
      "story_videos",
      `${post.user_id}/${post.id}.mp4`,
      videoBytes,
      "video/mp4"
    );
    console.log(`ok — $${composed.costUsd.toFixed(4)}`);

    await rest(`voice_posts?id=eq.${post.id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        illustration_status: "ready",
        illustration_cover_url: rows[0].image_url,
        video_url: videoUrl,
        video_status: "ready",
        duration_ms: totalMs,
      }),
    });

    console.log(`  ✅ ${rows.length} planches + vidéo en ligne\n`);
  }

  console.log("Terminé. Les anecdotes remontent en tête du feed.\n");
}

main().catch((err) => {
  console.error(`\n${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
