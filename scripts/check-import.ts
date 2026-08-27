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

import { readFile, readdir } from "node:fs/promises";
import { resolveEnv } from "./lib/env.js";
import { isIllustrated, orderFeed } from "../src/lib/feedOrder.js";

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

/** PostgREST's code for a table its schema cache does not know. */
const NO_SUCH_TABLE = "PGRST205";

async function query(url: string, key: string, path: string, optional = false) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  const body = await res.text();

  if (!res.ok) {
    // The app swallows this case — a missing table comes back as {data: null}
    // and the feed carries on with nothing. Mirroring that here keeps the
    // replay faithful instead of stopping at the first gap.
    if (optional && body.includes(NO_SUCH_TABLE)) {
      console.log(`  ⚠️  ${path.split("?")[0]} n'existe pas dans cette base — traité comme vide.`);
      return [];
    }
    throw new Error(`${res.status} ${body}`);
  }
  return body.trim() === "" ? [] : JSON.parse(body);
}

/**
 * Names every table the repo's migrations create that the live database does
 * not have.
 *
 * listened_posts turned up missing while chasing a feed problem, even though a
 * migration creates it — so the deployed schema has drifted from the repo, and
 * a drift found by accident is one that was going to bite again.
 */
async function auditSchema(url: string, key: string) {
  const dir = new URL("../supabase/migrations/", import.meta.url);
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql"));

  const expected = new Set<string>();
  for (const f of files) {
    const sql = await readFile(new URL(f, dir), "utf8");
    for (const m of sql.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?public\.(\w+)/gi)) {
      expected.add(m[1]);
    }
  }

  const missing: string[] = [];
  for (const table of [...expected].sort()) {
    const res = await fetch(`${url}/rest/v1/${table}?select=*&limit=0`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!res.ok && (await res.text()).includes(NO_SUCH_TABLE)) missing.push(table);
  }

  console.log(`\n═══ Schéma : ${expected.size} tables attendues par les migrations ═══`);
  if (missing.length === 0) {
    console.log("  ✅ Toutes présentes.");
    return;
  }
  console.log(`  ❌ ${missing.length} absente(s) de la base :`);
  for (const t of missing) console.log(`     ${t}`);
  console.log("\n  Rejoue les migrations correspondantes dans le SQL Editor.");
}

/**
 * Checks that select("*") really returns the illustration columns.
 *
 * The app asks for "*", not for named columns, and PostgREST answers "*" with
 * only the columns the caller's role may read — silently. A column-level grant
 * that stopped at the older columns would therefore hand the feed rows with no
 * illustration_status and no video_url, which is exactly what "the videos are
 * not first" looks like, while every explicit query here keeps succeeding.
 */
async function probeStar(url: string, key: string, label: string) {
  const rows = (await query(url, key, "voice_posts?select=*&limit=1")) as Record<string, unknown>[];
  if (rows.length === 0) {
    console.log(`  ${label} : aucune ligne lisible.`);
    return;
  }
  const got = new Set(Object.keys(rows[0]));
  const needed = [
    "illustration_status",
    "illustration_cover_url",
    "video_url",
    "video_status",
    "duration_ms",
    "transcription_segments",
  ];
  const absent = needed.filter((c) => !got.has(c));
  if (absent.length === 0) {
    console.log(`  ${label} : select("*") renvoie bien les ${needed.length} colonnes.`);
  } else {
    console.log(`  ${label} : ⚠️ select("*") OMET ${absent.join(", ")}`);
    console.log("     (droits par colonne : la ligne arrive sans, et sans erreur)");
  }
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

/**
 * Finds an account from its auth record, by email or by the part before the @.
 *
 * The profiles table carries no username in this project, so a handle someone
 * uses for themselves often lives only on the auth side. Admin API rather than
 * PostgREST: the auth schema is not exposed over REST.
 */
async function profileFromAuth(
  url: string,
  service: string,
  needle: string
): Promise<{ id: string; username: string | null; display_name: string | null } | null> {
  const res = await fetch(`${url}/auth/v1/admin/users?per_page=500`, {
    headers: { apikey: service, Authorization: `Bearer ${service}` },
  });
  if (!res.ok) return null;

  const { users } = (await res.json()) as { users: { id: string; email?: string }[] };
  const want = needle.toLowerCase();
  const hit = users.find((u) => {
    const email = (u.email ?? "").toLowerCase();
    return email === want || email.split("@")[0] === want || email.startsWith(want);
  });
  if (!hit) return null;

  const rows = (await query(
    url,
    service,
    `profiles?select=id,username,display_name&id=eq.${hit.id}`
  )) as { id: string; username: string | null; display_name: string | null }[];

  console.log(`  (trouvé via l'e-mail du compte : ${hit.email})`);
  return rows[0] ?? { id: hit.id, username: null, display_name: hit.email ?? null };
}

/**
 * Replays the feed exactly as the app builds it, for one real account.
 *
 * "It is not first in my feed" cannot be settled by reading the ordering code:
 * the order depends on that account's blocks and listening history, which an
 * anonymous query cannot see. So this rebuilds the list the same way the hook
 * does — same filters, same orderFeed — and prints the head of it.
 */
async function replayFeed(url: string, service: string, username: string) {
  // Matched loosely on purpose: people give the name they see, which may be
  // the display name, and may not match the stored case.
  const needle = encodeURIComponent(`*${username}*`);
  const profiles = (await query(
    url,
    service,
    `profiles?select=id,username,display_name&or=(username.ilike.${needle},display_name.ilike.${needle})`
  )) as { id: string; username: string | null; display_name: string | null }[];

  // profiles.username is null for every account in this project, so a handle
  // people use to describe themselves may only exist on the auth record —
  // as the local part of their email. Fall back to that before giving up.
  if (profiles.length === 0) {
    const byEmail = await profileFromAuth(url, service, username);
    if (byEmail) profiles.push(byEmail);
  }

  if (profiles.length === 0) {
    console.log(`\n❌ Aucun compte ne correspond à « ${username} ».`);
    const sample = (await query(
      url,
      service,
      "profiles?select=username,display_name&limit=15"
    )) as { username: string | null; display_name: string | null }[];
    console.log("   Comptes existants, pour retrouver le bon :");
    for (const p of sample) {
      console.log(`     @${p.username ?? "—"}  (${p.display_name ?? "sans nom"})`);
    }
    console.log("");
    return;
  }

  if (profiles.length > 1) {
    console.log(`\n(${profiles.length} comptes correspondent ; je prends le premier.)`);
  }
  const me = profiles[0];
  console.log(`\n═══ Feed reconstitué pour ${me.display_name} (@${me.username}) ═══`);

  const [posts, blocks, listened] = (await Promise.all([
    query(url, service, `voice_posts?select=id,title,group_id,user_id,likes_count,comments_count,illustration_status,video_url&limit=1000`),
    query(url, service, `blocks?select=blocked_user_id&user_id=eq.${me.id}`, true),
    query(url, service, `listened_posts?select=post_id&user_id=eq.${me.id}`, true),
  ])) as [
    (FeedRow & { group_id: string | null; user_id: string })[],
    { blocked_user_id: string }[],
    { post_id: string }[],
  ];

  const blocked = new Set(blocks.map((b) => b.blocked_user_id));
  const heard = new Set(listened.map((l) => l.post_id));
  console.log(`  auteurs bloqués : ${blocked.size}   anecdotes déjà écoutées : ${heard.size}`);

  // The same two filters the app applies, in the same order.
  const visible = posts.filter((p) => !blocked.has(p.user_id));
  const forYou = visible.filter((p) => !p.group_id); // "Pour toi" masque les groupes
  console.log(`  ${posts.length} au total → ${visible.length} non bloquées → ${forYou.length} dans « Pour toi »`);

  // Ordering without the shuffle, so the partition is what shows.
  const ordered = orderFeed(forYou, heard, (a) => [...a]);
  console.log("\n  Les 6 premières que l'app afficherait :");
  ordered.slice(0, 6).forEach((p, i) => {
    const mark = isIllustrated(p) ? "🎬" : "  ";
    console.log(`   ${i + 1}. ${mark} ${(p as FeedRow & { title: string }).title}`);
  });

  const missing = posts.filter(isIllustrated).filter((p) => !forYou.some((v) => v.id === p.id));
  for (const p of missing) {
    const why = blocked.has(p.user_id) ? "auteur bloqué" : "anecdote de groupe";
    console.log(`\n  ⚠️  « ${(p as FeedRow & { title: string }).title} » est illustrée mais absente du feed : ${why}.`);
  }
}

interface FeedRow {
  id: string;
  likes_count: number;
  comments_count: number;
  illustration_status?: string | null;
  video_url?: string | null;
}

async function main() {
  const argv = process.argv.slice(2);
  const i = argv.indexOf("--titles");
  const titles = i >= 0 && argv[i + 1] ? argv[i + 1].split(";").map((s) => s.trim()) : null;
  const u = argv.indexOf("--as-user");
  const asUser = u >= 0 && argv[u + 1] ? argv[u + 1] : null;

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

  // The ordering an account actually gets depends on its own blocks and
  // listening history, which the anonymous read above cannot see.
  console.log("\n═══ Ce que select(\"*\") ramène, comme le fait le feed ═══");
  await probeStar(url, anon, "clé publique");

  if (service) await auditSchema(url, service);

  if (asUser) {
    if (!service) console.log("\n(--as-user demande SUPABASE_SERVICE_ROLE_KEY.)");
    else await replayFeed(url, service, asUser.replace(/^@/, ""));
  }
  console.log(
    "Si tout est vert ici mais que l'app ne montre rien, c'est le bundle iOS :\n" +
      "  npm run ios:build   (lancer depuis Xcode ne reconstruit PAS le web)\n"
  );
}

main().catch((err) => {
  console.error(`\n${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
