/**
 * Reports what the app actually sees for the illustrated anecdotes.
 *
 * When a video does not show up there are four candidate causes, and reading
 * the code cannot tell them apart: the row was never updated, the row is
 * updated but row-level security hides it from the app, the URL is stored but
 * the file is not reachable, or the app is simply running an older bundle.
 *
 * So this queries with the SAME publishable key the app uses, replays the real
 * feed predicate on the rows that come back, and fetches the stored URLs. It
 * writes nothing and costs nothing.
 *
 *   npx tsx scripts/check-import.ts
 *   npx tsx scripts/check-import.ts --titles "windsor;pluie"
 */

import { resolveEnv } from "./lib/env.js";
import { isIllustrated } from "../src/lib/feedOrder.js";

interface PostRow {
  id: string;
  title: string;
  duration: number;
  duration_ms: number | null;
  illustration_status: string | null;
  illustration_cover_url: string | null;
  video_url: string | null;
  video_status: string | null;
  transcription_segments: unknown;
  likes_count: number | null;
  comments_count: number | null;
}

const FIELDS =
  "id,title,duration,duration_ms,illustration_status,illustration_cover_url," +
  "video_url,video_status,transcription_segments,likes_count,comments_count";

async function query(url: string, key: string, path: string) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${body}`);
  return body.trim() === "" ? [] : JSON.parse(body);
}

/** Is the stored file actually served? A URL in the row proves nothing. */
async function reachable(url: string): Promise<string> {
  try {
    const res = await fetch(url, { method: "HEAD" });
    const size = res.headers.get("content-length");
    const mb = size ? ` — ${(Number(size) / 1e6).toFixed(1)} Mo` : "";
    return res.ok ? `HTTP ${res.status}${mb}` : `HTTP ${res.status} ⚠️ INACCESSIBLE`;
  } catch (err) {
    return `injoignable (${err instanceof Error ? err.message : String(err)}) ⚠️`;
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const i = argv.indexOf("--titles");
  const titles = i >= 0 && argv[i + 1] ? argv[i + 1].split(";").map((s) => s.trim()) : null;

  const url = (await resolveEnv("SUPABASE_URL", "VITE_SUPABASE_URL"))?.replace(/\/$/, "");
  const anon = await resolveEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_ANON_KEY");
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("URL Supabase introuvable — attendue dans .env.");
  if (!anon) throw new Error("Clé publique introuvable — attendue dans .env.");

  console.log(`\nProjet : ${url}\n`);

  // The app is anonymous-or-signed-in with the publishable key, never the
  // service role. Anything visible to one and not the other is RLS.
  const asApp: PostRow[] = await query(url, anon, `voice_posts?select=${FIELDS}&limit=1000`);
  console.log(`Anecdotes visibles par l'app : ${asApp.length}`);

  if (service) {
    const asAdmin: PostRow[] = await query(url, service, "voice_posts?select=id&limit=1000");
    if (asAdmin.length !== asApp.length) {
      console.log(
        `⚠️  La clé service en voit ${asAdmin.length}. ${asAdmin.length - asApp.length} ` +
          `anecdote(s) sont masquées à l'app par une politique RLS.`
      );
    }
  }

  const chosen = titles
    ? asApp.filter((p) => titles.some((t) => p.title?.toLowerCase().includes(t.toLowerCase())))
    : asApp.filter((p) => isIllustrated(p));

  if (chosen.length === 0) {
    console.log(
      "\n❌ Aucune anecdote illustrée n'est visible par l'app.\n" +
        "   Soit l'import n'a pas mis illustration_status à 'ready' ni video_url,\n" +
        "   soit une politique RLS masque ces lignes à la clé publique.\n"
    );
    return;
  }

  for (const p of chosen) {
    const panels: { id: string; image_url: string }[] = await query(
      url,
      anon,
      `post_illustrations?select=id,image_url&post_id=eq.${p.id}&order=idx`
    );
    const segments = Array.isArray(p.transcription_segments) ? p.transcription_segments.length : 0;

    console.log(`\n▸ ${p.title}`);
    console.log(`  illustration_status  ${p.illustration_status ?? "null"}`);
    console.log(`  video_status         ${p.video_status ?? "null"}`);
    console.log(`  duration_ms          ${p.duration_ms ?? "null"}  (duration=${p.duration}s)`);
    console.log(`  segments horodatés   ${segments}`);
    console.log(`  planches visibles    ${panels.length}`);
    if (p.video_url) console.log(`  vidéo                ${await reachable(p.video_url)}`);
    else console.log(`  vidéo                aucune (video_url est null) ⚠️`);
    if (panels[0]) console.log(`  1re planche          ${await reachable(panels[0].image_url)}`);

    // The exact predicates RealsViewer uses, so the verdict is not a guess.
    const leads = isIllustrated(p);
    const draws = panels.length > 0 || Boolean(p.video_url);
    console.log(`  → en tête du feed    ${leads ? "oui" : "NON ⚠️"}`);
    console.log(`  → diaporama affiché  ${draws ? "oui" : "NON ⚠️"}`);
  }

  const leaders = asApp.filter(isIllustrated);
  console.log(
    `\nRécapitulatif : ${leaders.length} anecdote(s) passeraient devant les ` +
      `${asApp.length - leaders.length} autres.`
  );
  console.log(
    "Si tout est vert ici mais que l'app ne montre rien, c'est le bundle iOS :\n" +
      "  npm run ios:build   (lancer depuis Xcode ne reconstruit PAS le web)\n"
  );
}

main().catch((err) => {
  console.error(`\n${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
