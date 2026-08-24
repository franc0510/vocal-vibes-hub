/**
 * Image-model bench for story illustrations.
 *
 * Generates the same storyboard through several image models and lays the
 * results out as a contact sheet, so the choice of provider is made on the
 * pictures rather than on marketing pages.
 *
 * The storyboard is built ONCE per anecdote and reused across every model —
 * otherwise you are comparing prompts, not models.
 *
 *   npx tsx scripts/bench-illustration.ts --help
 *
 * This script spends real money. It prints an estimate and refuses to run
 * without --yes.
 */

import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// The shared modules are written for Supabase's Deno runtime. Giving them the
// one global they need lets the bench exercise the exact same code path that
// ships in the Edge Function.
const shimTarget = globalThis as typeof globalThis & {
  Deno?: { env: { get(key: string): string | undefined } };
};
shimTarget.Deno ??= { env: { get: (key: string) => process.env[key] } };

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const SHARED = join(ROOT, "supabase", "functions", "_shared");

/** Every candidate, with the provider that serves it. */
const CANDIDATES: { provider: string; model: string; label: string }[] = [
  { provider: "fal", model: "fal-ai/flux/schnell", label: "FLUX.1 schnell" },
  { provider: "fal", model: "fal-ai/flux-2/pro", label: "FLUX.2 pro" },
  { provider: "fal", model: "fal-ai/qwen-image", label: "Qwen-Image" },
  { provider: "fal", model: "fal-ai/bytedance/seedream/v4/text-to-image", label: "Seedream V4" },
  { provider: "fal", model: "fal-ai/ideogram/v3", label: "Ideogram 3.0" },
  { provider: "fal", model: "fal-ai/nano-banana", label: "Nano Banana" },
  { provider: "openai", model: "gpt-image-1", label: "GPT Image" },
];

interface Anecdote {
  title: string;
  duration: number;
  transcription: string;
  audio_url?: string;
}

/**
 * Transcribes an anecdote through fal, so the benchmark does not depend on the
 * app's own transcription pipeline having run.
 *
 * Whisper costs a fraction of a cent per minute — irrelevant next to the image
 * generations this run is about.
 */
async function transcribeViaFal(audioUrl: string): Promise<string> {
  const apiKey = process.env.FAL_KEY;
  if (!apiKey) throw new Error("FAL_KEY manquant : impossible de transcrire.");

  const res = await fetch("https://fal.run/fal-ai/whisper", {
    method: "POST",
    headers: { Authorization: `Key ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ audio_url: audioUrl }),
  });
  if (!res.ok) throw new Error(`Transcription échouée : ${res.status} ${await res.text()}`);

  const json = await res.json();
  const text = (json?.text ?? "").trim();
  if (!text) throw new Error("Transcription vide");
  return text;
}

/**
 * Fills in transcriptions that the app has not produced.
 *
 * Only called for the real run: an estimate must stay free, so it merely
 * reports which anecdotes would be transcribed.
 */
async function fillMissingTranscriptions(anecdotes: Anecdote[]): Promise<void> {
  for (const a of anecdotes) {
    if (hasUsableTranscription(a) || !a.audio_url) continue;
    process.stdout.write(`  transcription de « ${a.title} »… `);
    a.transcription = await transcribeViaFal(a.audio_url);
    console.log(`${a.transcription.length} caractères`);
  }
}

interface Cell {
  anecdote: string;
  label: string;
  model: string;
  files: string[];
  costUsd: number;
  latencyMs: number;
  error?: string;
}

function parseArgs(argv: string[]) {
  const get = (flag: string, fallback?: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
  };
  return {
    yes: argv.includes("--yes"),
    help: argv.includes("--help"),
    fromDb: argv.includes("--from-db"),
    // Titles are separated by ";" because a title may well contain a comma.
    titles: get("--titles")?.split(";").map((s) => s.trim()).filter(Boolean),
    anecdotes: Number(get("--anecdotes", "5")),
    panels: Number(get("--panels", "0")) || 0, // 0 = derive from duration
    models: get("--models")?.split(",").map((s) => s.trim()),
    out: get("--out", join(ROOT, "bench-output")),
  };
}

function usage() {
  console.log(`
Image-model bench for VocMe story illustrations.

  npx tsx scripts/bench-illustration.ts --yes

Options
  --yes               Actually run. Without it, only the cost estimate prints.
  --titles "a;b"      Test these specific anecdotes, matched loosely on their
                      title, separated by semicolons. Implies reading your
                      database. This is how you name the ones you care about.
  --from-db           Without --titles: use the most recent transcribed
                      anecdotes from your database rather than the bundled
                      invented ones.
  --anecdotes <n>     HOW MANY anecdotes to test — a count, not a title
                      (default 5). Ignored when --titles is given.
  --panels <n>        Force a panel count (default: derived from duration).
  --models <a,b>      Comma-separated model ids, defaults to all candidates.
  --out <dir>         Output directory (default ./bench-output).

Environment
  FAL_KEY             Enough on its own: serves 6 of the 7 image candidates,
                      builds the storyboards, and transcribes anecdotes the
                      app has not transcribed yet.
  OPENAI_API_KEY      Optional. Preferred for storyboards when present (strict
                      schema), and required only for the GPT Image candidate.
  GEMINI_API_KEY      Only if you add a Gemini candidate.

Reading your anecdotes needs no extra secret: the connection is read from
.env (VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY), the same values
the app itself uses. Set SUPABASE_URL and SUPABASE_ANON_KEY to override.
`);
}

async function loadFixtures(limit: number): Promise<Anecdote[]> {
  const raw = await readFile(join(HERE, "bench-fixtures.json"), "utf8");
  return (JSON.parse(raw) as Anecdote[]).slice(0, limit);
}

/**
 * Supabase connection details, taken from the same place the app takes them.
 *
 * The publishable key is enough to read anecdotes: the RLS policy on
 * voice_posts allows any reader for posts that are not restricted to a group.
 * Environment variables win over the committed .env so CI can point elsewhere.
 */
async function supabaseConfig(): Promise<{ url: string; key: string }> {
  let url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
  let key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
    "";

  if (!url || !key) {
    try {
      const env = await readFile(join(ROOT, ".env"), "utf8");
      for (const line of env.split("\n")) {
        if (line.trim().startsWith("#")) continue;
        const [name, ...rest] = line.split("=");
        // Values are commonly quoted in a .env; the quotes are not part of them.
        const value = rest.join("=").trim().replace(/^['"]|['"]$/g, "");
        if (!value) continue;
        if (!url && name.trim() === "VITE_SUPABASE_URL") url = value;
        if (!key && name.trim() === "VITE_SUPABASE_PUBLISHABLE_KEY") key = value;
      }
    } catch {
      /* no .env; the error below explains what to provide */
    }
  }

  if (!url || !key) {
    throw new Error(
      "Impossible de trouver la configuration Supabase.\n" +
        "Attendu VITE_SUPABASE_URL et VITE_SUPABASE_PUBLISHABLE_KEY dans .env,\n" +
        "ou SUPABASE_URL et SUPABASE_ANON_KEY dans l'environnement."
    );
  }
  return { url: url.replace(/\/$/, ""), key };
}

async function queryPosts(params: URLSearchParams): Promise<Anecdote[]> {
  const { url, key } = await supabaseConfig();
  const res = await fetch(`${url}/rest/v1/voice_posts?${params}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) {
    throw new Error(`Lecture de voice_posts impossible : ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as Anecdote[];
}

/**
 * Below this a transcription cannot carry a storyboard: there is simply not
 * enough narrative to split into panels.
 */
export const MIN_TRANSCRIPTION_LENGTH = 120;

const transcriptionLength = (a: Anecdote) => (a.transcription ?? "").trim().length;
const hasUsableTranscription = (a: Anecdote) =>
  transcriptionLength(a) >= MIN_TRANSCRIPTION_LENGTH;

/**
 * Explains why a found post cannot be used.
 *
 * "not transcribed" and "transcribed but too short" look the same from the
 * outside and have completely different fixes, so they are never merged into
 * one message.
 */
function unusableReason(a: Anecdote): string {
  const length = transcriptionLength(a);
  if (!a.audio_url) return "ni transcription ni audio — rien à illustrer";
  if (length === 0) {
    return "aucune transcription — la transcription automatique n'a pas tourné, ou a échoué";
  }
  return `transcription trop courte : ${length} caractères, il en faut ${MIN_TRANSCRIPTION_LENGTH}`;
}

/** Named anecdotes, matched loosely on the title so partial wording works. */
async function loadByTitles(titles: string[]): Promise<Anecdote[]> {
  const found: Anecdote[] = [];
  const problems: string[] = [];

  for (const title of titles) {
    // PostgREST treats these as syntax inside a filter, so keep them out.
    const needle = title.trim().replace(/[,()*]/g, " ").trim();
    if (!needle) continue;

    const params = new URLSearchParams({
      select: "title,duration,transcription,audio_url",
      title: `ilike.*${needle}*`,
      order: "created_at.desc",
      limit: "5",
    });

    const rows = await queryPosts(params);
    // A post with no transcription is still usable when its audio is there:
    // the run transcribes it itself rather than waiting on the app's pipeline.
    const usable = rows.find(hasUsableTranscription) ?? rows.find((r) => r.audio_url);

    if (usable) {
      found.push(usable);
    } else if (rows.length === 0) {
      problems.push(`  • "${title}" — aucun post ne porte ce titre`);
    } else {
      // Report every candidate: one of them may be the post they meant.
      problems.push(`  • "${title}" — ${rows.length} post(s) trouvé(s), aucun utilisable :`);
      for (const r of rows) problems.push(`      « ${r.title} » (${r.duration}s) → ${unusableReason(r)}`);
    }
  }

  if (problems.length > 0) {
    const lines = ["Certaines anecdotes demandées n'ont pas pu être utilisées :", ...problems];
    if (found.length === 0) {
      lines.push(
        "",
        "Rien à comparer, le benchmark s'arrête ici.",
        "Options :",
        "  – laisse la transcription se faire, puis relance ;",
        "  – ou lance sur les anecdotes d'exemple (source « exemples ») pour",
        "    comparer les modèles tout de suite, avec des textes fournis."
      );
      throw new Error(lines.join("\n"));
    }
    console.warn(`\n⚠️  ${lines.join("\n")}\n`);
  }

  return found;
}

/**
 * The most recent transcribed anecdotes.
 *
 * Prefer real anecdotes over the fixtures: how people actually tell a story
 * is exactly the variable a model has to cope with, and invented samples are
 * written by someone who already knows what makes a good prompt.
 */
async function loadRecent(limit: number): Promise<Anecdote[]> {
  const params = new URLSearchParams({
    select: "title,duration,transcription,audio_url",
    order: "created_at.desc",
    // Over-fetch, then keep only the substantial ones.
    limit: String(limit * 4),
  });

  // Audio alone is enough: anything missing a transcription gets one here.
  const usable = (await queryPosts(params)).filter((a) => hasUsableTranscription(a) || a.audio_url);
  if (usable.length === 0) {
    throw new Error(
      "Aucune anecdote transcrite trouvée. Publie et laisse transcrire quelques posts,\n" +
        "ou retire --from-db pour utiliser les anecdotes d'exemple."
    );
  }
  return usable.slice(0, limit);
}

async function loadAnecdotes(
  limit: number,
  fromDb: boolean,
  titles?: string[]
): Promise<Anecdote[]> {
  if (titles && titles.length > 0) return loadByTitles(titles);
  return fromDb ? loadRecent(limit) : loadFixtures(limit);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

function contactSheet(cells: Cell[], anecdotes: Anecdote[], labels: string[]): string {
  const byKey = new Map(cells.map((c) => [`${c.anecdote}::${c.label}`, c]));

  const rows = anecdotes
    .map((a) => {
      const cols = labels
        .map((label) => {
          const cell = byKey.get(`${a.title}::${label}`);
          if (!cell) return `<td class="cell"><div class="err">not run</div></td>`;
          if (cell.error) return `<td class="cell"><div class="err">${escapeHtml(cell.error)}</div></td>`;
          const strip = cell.files.map((f) => `<img src="${escapeHtml(f)}" loading="lazy">`).join("");
          return `<td class="cell">
            <div class="strip">${strip}</div>
            <div class="meta">$${cell.costUsd.toFixed(3)} · ${(cell.latencyMs / 1000).toFixed(1)}s</div>
          </td>`;
        })
        .join("");
      return `<tr><th class="rowhead"><div>${escapeHtml(a.title)}</div><p>${escapeHtml(
        a.transcription.slice(0, 180)
      )}…</p></th>${cols}</tr>`;
    })
    .join("");

  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Bench illustrations VocMe</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 14px/1.5 -apple-system, system-ui, sans-serif; margin: 0; padding: 24px; background: #fafaf8; color: #17151a; }
  @media (prefers-color-scheme: dark) { body { background: #141318; color: #ece9e2; } }
  h1 { font-size: 20px; margin: 0 0 4px; }
  p.sub { margin: 0 0 20px; opacity: .65; }
  .scroll { overflow-x: auto; }
  table { border-collapse: collapse; }
  th, td { border: 1px solid rgba(128,128,128,.35); vertical-align: top; }
  thead th { position: sticky; top: 0; background: #17151a; color: #fff; padding: 8px 12px; font-size: 12px; letter-spacing: .06em; text-transform: uppercase; white-space: nowrap; }
  .rowhead { width: 220px; padding: 10px 12px; text-align: left; font-weight: 600; }
  .rowhead p { font-weight: 400; font-size: 12px; opacity: .6; margin: 6px 0 0; }
  .cell { padding: 8px; }
  .strip { display: flex; gap: 4px; }
  .strip img { width: 96px; height: 170px; object-fit: cover; border-radius: 2px; background: rgba(128,128,128,.2); }
  .meta { font-size: 11px; opacity: .6; margin-top: 6px; font-variant-numeric: tabular-nums; }
  .err { font-size: 12px; color: #c8352a; max-width: 260px; }
</style></head>
<body>
<h1>Bench illustrations — ligne claire</h1>
<p class="sub">Même storyboard pour tous les modèles. Regarde d'abord si le personnage reste le même d'une case à l'autre.</p>
<div class="scroll"><table>
<thead><tr><th class="rowhead">Anecdote</th>${labels.map((l) => `<th>${escapeHtml(l)}</th>`).join("")}</tr></thead>
<tbody>${rows}</tbody>
</table></div>
</body></html>`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return usage();

  const candidates = args.models
    ? CANDIDATES.filter((c) => args.models!.includes(c.model))
    : CANDIDATES;

  if (candidates.length === 0) {
    console.error("No candidate matched --models.");
    process.exitCode = 1;
    return;
  }

  const { getStyle, buildPanelPrompt } = await import(join(SHARED, "styles.ts"));
  const { getImageProvider, generateWithRetry } = await import(join(SHARED, "imageProviders.ts"));
  const { buildStoryboard, planPanelCount } = await import(join(SHARED, "storyboard.ts"));

  const anecdotes = await loadAnecdotes(args.anecdotes, args.fromDb, args.titles);
  const style = getStyle("ligne-claire");

  const panelsPer = anecdotes.map((a) => args.panels || planPanelCount(a.duration));
  const totalImages = panelsPer.reduce((s, n) => s + n, 0) * candidates.length;

  const source = args.titles?.length
    ? "ta base Supabase (anecdotes nommées)"
    : args.fromDb
      ? "ta base Supabase (les plus récentes)"
      : "anecdotes d'exemple (bench-fixtures.json)";
  console.log(`\nSource    : ${source}`);
  anecdotes.forEach((a, i) => {
    const note = hasUsableTranscription(a) ? "" : " — sera transcrite au lancement";
    console.log(`            ${i + 1}. ${a.title} (${a.duration}s, ${panelsPer[i]} cases)${note}`);
  });
  console.log(`Anecdotes : ${anecdotes.length}`);
  console.log(`Modèles   : ${candidates.length} (${candidates.map((c) => c.label).join(", ")})`);
  console.log(`Images    : ${totalImages}`);
  console.log(`Coût estimé : environ $${(totalImages * 0.03).toFixed(2)} au tarif moyen constaté.\n`);

  if (!args.yes) {
    console.log("Relance avec --yes pour générer réellement.\n");
    return;
  }

  // Either key can build a storyboard, so only the absence of both is fatal.
  if (!process.env.OPENAI_API_KEY && !process.env.FAL_KEY) {
    console.error(
      "Ni OPENAI_API_KEY ni FAL_KEY : impossible de construire les storyboards.\n" +
        "FAL_KEY seule suffit — elle sert aussi à la transcription et à 6 des 7 modèles."
    );
    process.exitCode = 1;
    return;
  }
  if (!process.env.OPENAI_API_KEY) {
    console.log("ℹ️  Pas d'OPENAI_API_KEY : storyboards et transcriptions passent par fal.\n");
  }

  // Anything the app never transcribed gets transcribed here, so the benchmark
  // is not blocked on the app's own pipeline.
  await fillMissingTranscriptions(anecdotes);

  const imagesDir = join(args.out, "images");
  await mkdir(imagesDir, { recursive: true });

  const cells: Cell[] = [];

  for (const [i, anecdote] of anecdotes.entries()) {
    console.log(`\n▸ ${anecdote.title}`);
    process.stdout.write("  storyboard… ");

    let storyboard;
    try {
      storyboard = await buildStoryboard({
        title: anecdote.title,
        transcription: anecdote.transcription,
        segments: null,
        durationSec: anecdote.duration,
        panelCount: panelsPer[i],
      });
      console.log(`${storyboard.scenes.length} cases`);
    } catch (err) {
      console.log(`échec : ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }

    for (const candidate of candidates) {
      process.stdout.write(`  ${candidate.label.padEnd(16)} `);
      const cell: Cell = {
        anecdote: anecdote.title,
        label: candidate.label,
        model: candidate.model,
        files: [],
        costUsd: 0,
        latencyMs: 0,
      };

      try {
        const provider = getImageProvider({ provider: candidate.provider, model: candidate.model });
        const seed = 1234;

        for (const scene of storyboard.scenes) {
          const result = await generateWithRetry(provider, {
            prompt: buildPanelPrompt(style, storyboard.cast, scene.description),
            style,
            aspectRatio: "9:16",
            seed: seed + scene.idx,
          });
          const name = `${i}-${candidate.model.replace(/[^a-z0-9]+/gi, "_")}-${scene.idx}.jpg`;
          await writeFile(join(imagesDir, name), result.bytes);
          cell.files.push(`images/${name}`);
          cell.costUsd += result.costUsd;
          cell.latencyMs += result.latencyMs;
        }
        console.log(`ok — $${cell.costUsd.toFixed(3)} / ${(cell.latencyMs / 1000).toFixed(1)}s`);
      } catch (err) {
        cell.error = err instanceof Error ? err.message : String(err);
        console.log(`échec : ${cell.error.slice(0, 80)}`);
      }

      cells.push(cell);
    }
  }

  const labels = candidates.map((c) => c.label);
  await writeFile(join(args.out, "index.html"), contactSheet(cells, anecdotes, labels), "utf8");

  const csv = [
    "anecdote,model,panels,cost_usd,latency_s,error",
    ...cells.map((c) =>
      [
        JSON.stringify(c.anecdote),
        c.model,
        c.files.length,
        c.costUsd.toFixed(4),
        (c.latencyMs / 1000).toFixed(1),
        JSON.stringify(c.error ?? ""),
      ].join(",")
    ),
  ].join("\n");
  await writeFile(join(args.out, "results.csv"), csv, "utf8");

  const spent = cells.reduce((s, c) => s + c.costUsd, 0);
  console.log(`\n✅ Terminé — $${spent.toFixed(2)} dépensés.`);
  console.log(`   Planche contact : ${join(args.out, "index.html")}`);
  console.log(`   Données         : ${join(args.out, "results.csv")}\n`);
}

main().catch((err) => {
  // Configuration mistakes are the common case here, and a stack trace buries
  // the one line that says what to fix.
  console.error(`\n${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
