import {
  buildCrawlerHtml,
  cardDescription,
  cardTitle,
  fetchGroupCard,
} from "./_share";

/**
 * L'aperçu d'un lien d'invitation à un groupe.
 *
 * Cette fonction ne sert QUE les robots des messageries : `vercel.json` ne
 * l'atteint que sur reconnaissance de leur `User-Agent`. Tout le monde reçoit
 * l'application, exactement comme avant — le partage ne peut donc pas casser
 * le chemin normal, ce qui serait un bien mauvais échange pour une jolie
 * vignette.
 *
 * Un code inconnu, ou Supabase injoignable, rendent la carte générique de
 * VocMe plutôt qu'une erreur : un aperçu raté se voit dans la conversation de
 * tout le monde, et pour toujours — les messageries gardent l'aperçu en cache.
 */

interface Req {
  query: Record<string, string | string[] | undefined>;
  headers: Record<string, string | string[] | undefined>;
}
interface Res {
  status: (code: number) => Res;
  setHeader: (name: string, value: string) => void;
  send: (body: string) => void;
}

const first = (v: string | string[] | undefined): string =>
  (Array.isArray(v) ? v[0] : v) ?? "";

/**
 * L'origine publique du site.
 *
 * `VERCEL_URL` change à chaque déploiement de prévisualisation ; `VITE_APP_URL`
 * est le domaine stable que le reste de l'application utilise déjà pour
 * fabriquer les liens. On préfère le second, et on retombe sur l'en-tête de la
 * requête pour qu'un déploiement de test s'annonce sous sa propre adresse.
 */
const originOf = (req: Req): string => {
  const declared = process.env.VITE_APP_URL || process.env.APP_URL;
  if (declared) return declared.replace(/\/+$/, "");
  const host = first(req.headers["x-forwarded-host"]) || first(req.headers.host);
  return host ? `https://${host}` : "";
};

export default async function handler(req: Req, res: Res) {
  const code = first(req.query.code).trim().toUpperCase();
  const origin = originOf(req);

  const card = await fetchGroupCard(code, {
    url: process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
    key: process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY,
  });

  const html = buildCrawlerHtml({
    title: card ? cardTitle(card) : "Join us on VocMe",
    description: card
      ? cardDescription(card)
      : "You've been invited to a group on VocMe — voice notes that stay inside the group.",
    image: `${origin}/api/og-group?code=${encodeURIComponent(code)}`,
    url: `${origin}/join-group/${encodeURIComponent(code)}`,
  });

  // Court en cache : le nom d'un groupe et son nombre de membres bougent, et
  // une messagerie qui a gardé l'aperçu d'hier vaut mieux qu'un aller-retour
  // vers Supabase à chaque coup d'œil.
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=3600");
  res.status(200).send(html);
}
