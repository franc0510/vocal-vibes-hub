/**
 * Re-encodes the stored panels at display size.
 *
 * Measured on the live project: the panels average 1135 Ko, so a twelve-panel
 * anecdote asks the phone for about 13 Mo while the voice is already playing.
 * That is the loading time, and it is also why a panel sometimes arrived after
 * its moment had passed.
 *
 * Supabase can resize on the fly, but the endpoint answers 403 on this plan —
 * checked, not assumed — so the files themselves have to shrink. A phone never
 * shows more than ~1080 pixels across; anything beyond that is downloaded and
 * thrown away.
 *
 *   npx tsx scripts/shrink-panels.ts            # mesure, n'écrit rien
 *   npx tsx scripts/shrink-panels.ts --yes      # réencode
 *   npx tsx scripts/shrink-panels.ts --yes --limit 10
 *
 * Needs SUPABASE_SERVICE_ROLE_KEY: it overwrites objects it does not own.
 */

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { resolveEnv } from "./lib/env.js";

/** Wide enough for any phone at 3×, small enough to arrive in time. */
const MAX_WIDTH = 1080;
const JPEG_QUALITY = 78;

/** Below this the file is already light; re-encoding would only lose detail. */
const SKIP_UNDER_BYTES = 250 * 1024;

interface Panel {
  id: string;
  post_id: string;
  idx: number;
  image_url: string;
}

let cached: { url: string; key: string } | null = null;

async function config() {
  if (cached) return cached;
  const url = await resolveEnv("SUPABASE_URL", "VITE_SUPABASE_URL");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("URL Supabase introuvable — attendue dans .env.");
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY manquante.\n" +
        "La clé publique ne suffit pas : ce script réécrit des fichiers."
    );
  }
  cached = { url: url.replace(/\/$/, ""), key };
  return cached;
}

async function listPanels(): Promise<Panel[]> {
  const { url, key } = await config();
  const res = await fetch(
    `${url}/rest/v1/post_illustrations?select=id,post_id,idx,image_url&order=post_id,idx&limit=5000`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } }
  );
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

/**
 * The path inside the bucket, recovered from the public URL.
 *
 * Re-uploading to the same path is what makes this safe to run twice and keeps
 * every image_url already stored in a row valid — no database write at all.
 */
function storagePath(publicUrl: string): string | null {
  const marker = "/storage/v1/object/public/story_images/";
  const at = publicUrl.indexOf(marker);
  return at < 0 ? null : decodeURIComponent(publicUrl.slice(at + marker.length));
}

async function upload(path: string, body: Buffer) {
  const { url, key } = await config();
  const res = await fetch(`${url}/storage/v1/object/story_images/${path}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "image/jpeg",
      "x-upsert": "true",
      // Panels never change once generated, so let phones keep them for a year.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
    body: new Uint8Array(body),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
}

const kb = (n: number) => `${Math.round(n / 1024)} Ko`;

async function main() {
  const argv = process.argv.slice(2);
  const write = argv.includes("--yes");
  const at = argv.indexOf("--limit");
  const limit = at >= 0 && argv[at + 1] ? Number(argv[at + 1]) : Infinity;

  const panels = (await listPanels()).slice(0, limit);
  console.log(`\n${panels.length} planches à examiner.\n`);

  let before = 0;
  let after = 0;
  let rewritten = 0;
  let skipped = 0;
  let failed = 0;

  for (const panel of panels) {
    const path = storagePath(panel.image_url);
    if (!path) {
      console.log(`  ⚠️  chemin illisible : ${panel.image_url}`);
      failed += 1;
      continue;
    }

    try {
      const res = await fetch(panel.image_url);
      if (!res.ok) throw new Error(`téléchargement ${res.status}`);
      const original = Buffer.from(await res.arrayBuffer());
      before += original.length;

      if (original.length < SKIP_UNDER_BYTES) {
        after += original.length;
        skipped += 1;
        continue;
      }

      const shrunk = await sharp(original)
        // withoutEnlargement: a panel already narrower than the cap is left at
        // its size rather than blown up and re-compressed for nothing.
        .resize({ width: MAX_WIDTH, withoutEnlargement: true })
        .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
        .toBuffer();

      // Refuse a "shrink" that grew: some panels are already well compressed.
      if (shrunk.length >= original.length) {
        after += original.length;
        skipped += 1;
        continue;
      }

      after += shrunk.length;
      if (write) {
        await upload(path, shrunk);
        rewritten += 1;
        process.stdout.write(`\r  réencodées : ${rewritten}`);
      } else {
        rewritten += 1;
      }
    } catch (err) {
      // One unreadable panel must not strand the rest.
      console.log(`\n  ⚠️  ${path} — ${err instanceof Error ? err.message : String(err)}`);
      failed += 1;
    }
  }

  if (write) console.log("");
  const saved = before - after;
  console.log(`\nAvant  : ${kb(before)}`);
  console.log(`Après  : ${kb(after)}`);
  console.log(
    `Gain   : ${kb(saved)} — ${before > 0 ? Math.round((saved / before) * 100) : 0} % de moins à télécharger`
  );
  console.log(
    `\n${rewritten} planche(s) à réencoder, ${skipped} déjà légère(s)${failed ? `, ${failed} en échec` : ""}.`
  );

  if (!write) {
    console.log("\nRien n'a été écrit. Relance avec --yes pour réencoder.\n");
    return;
  }
  console.log(
    "\nLes URL ne changent pas : les fichiers sont réécrits au même chemin,\n" +
      "donc aucune ligne de la base n'est touchée et le script est rejouable.\n"
  );
}

const runDirectly = !!process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (runDirectly) {
  main().catch((err) => {
    console.error(`\n${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  });
}

export { storagePath, MAX_WIDTH, SKIP_UNDER_BYTES };
