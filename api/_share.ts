/**
 * Ce qu'une messagerie voit quand on lui colle un lien d'invitation.
 *
 * Un aperçu de lien est fabriqué par un ROBOT — celui de WhatsApp, d'iMessage,
 * de Slack — qui télécharge la page et lit ses balises `<meta>`. Aucun de ces
 * robots n'exécute JavaScript. Or VocMe est une application monopage : le
 * serveur renvoie le même `index.html` pour toutes les URL, et les balises y
 * sont écrites une fois pour toutes, à la construction.
 *
 * Conséquence, visible aujourd'hui en production : coller le lien d'un groupe
 * affiche « Lovable App — Lovable Generated Project » et une capture d'écran
 * qui n'a rien à voir. L'invitation la plus soignée ressemble à un lien douteux.
 *
 * D'où ces fonctions, appelées par deux petites fonctions serveur : elles
 * fabriquent, pour un groupe donné, le titre, la description et l'image que le
 * robot ira lire. Elles sont pures et sans entrée-sortie, pour que le rendu
 * puisse être vérifié sans déployer quoi que ce soit.
 */

/** L'invitation, telle que la rend `group_invite_preview`. */
export interface GroupCard {
  name: string;
  member_count: number;
  owner_name: string | null;
  owner_username: string | null;
}

/**
 * Le texte d'un groupe vient de ses membres : il peut contenir n'importe quoi.
 *
 * Sans échappement, un groupe nommé `"><script>` casserait la page servie au
 * robot — et, pire, le nom se retrouve dans une image SVG, où un `<` mal placé
 * suffit à rendre le document illisible et donc l'aperçu vide.
 */
export const escapeXml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** Coupe proprement, sans laisser une phrase pendante au milieu d'un mot. */
export const truncate = (value: string, max: number): string =>
  value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;

/**
 * La taille du nom, choisie pour qu'il tienne sur une ligne.
 *
 * Space Grotesk Bold fait environ 0,58 em de large par caractère. Plutôt que
 * de mesurer le texte — ce qui demanderait de charger la police ici — on part
 * de cette moyenne et on descend par paliers : un nom court reste imposant, un
 * nom long rétrécit au lieu de déborder de l'image.
 */
export const fitFontSize = (name: string, maxWidth = 1020, max = 96, min = 46): number => {
  const size = Math.floor(maxWidth / (Math.max(name.length, 1) * 0.58));
  return Math.max(min, Math.min(max, size));
};

/** Ce que dit la carte sous le nom du groupe. */
export const cardSubtitle = (card: GroupCard): string => {
  const host = card.owner_name || (card.owner_username ? `@${card.owner_username}` : null);
  const members = `${card.member_count} member${card.member_count === 1 ? "" : "s"}`;
  return host ? `${host} · ${members}` : members;
};

/** La phrase qui accompagne le lien dans la conversation. */
export const cardDescription = (card: GroupCard): string =>
  `Join us on VocMe — ${cardSubtitle(card)}. Voice notes that stay inside the group.`;

/** Le titre de l'aperçu : le nom du groupe, et rien qui le noie. */
export const cardTitle = (card: GroupCard): string =>
  `${truncate(card.name, 60)} · Join us on VocMe`;

/**
 * L'image de l'aperçu, en SVG — convertie en PNG par `og-group`.
 *
 * En SVG parce que la carte est du texte sur un dégradé : la décrire tient en
 * trente lignes, là où un moteur de rendu HTML complet demanderait une
 * dépendance qui ne s'exécute que chez l'hébergeur, donc invérifiable ici.
 *
 * 1200 × 630 : le format que réclament Open Graph et Twitter pour une grande
 * carte. Plus petit, les messageries rognent ; plus grand, elles refusent.
 */
export const buildCardSvg = (card: GroupCard | null): string => {
  const name = card ? truncate(card.name, 34) : "VocMe";
  const nameSize = fitFontSize(name);
  const subtitle = card ? truncate(cardSubtitle(card), 46) : "Voice notes, between people who matter";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#EE2B2B"/>
      <stop offset="100%" stop-color="#F45925"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.78" cy="0.16" r="0.62">
      <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#glow)"/>

  <!-- La pastille du micro, reprise du bouton d'enregistrement. -->
  <circle cx="118" cy="104" r="34" fill="#FFFFFF" fill-opacity="0.18"/>
  <rect x="108" y="86" width="20" height="26" rx="10" fill="#FFFFFF"/>
  <path d="M101 106a17 17 0 0 0 34 0" fill="none" stroke="#FFFFFF" stroke-width="6" stroke-linecap="round"/>
  <rect x="115" y="123" width="6" height="9" rx="3" fill="#FFFFFF"/>
  <text x="170" y="118" font-family="Space Grotesk" font-size="40" font-weight="700"
        fill="#FFFFFF" letter-spacing="1">VocMe</text>

  <text x="90" y="336" font-family="Space Grotesk" font-size="${nameSize}" font-weight="700"
        fill="#FFFFFF">${escapeXml(name)}</text>

  <text x="90" y="404" font-family="Space Grotesk" font-size="34" font-weight="400"
        fill="#FFFFFF" fill-opacity="0.88">${escapeXml(subtitle)}</text>

  <!-- L'invitation elle-même, en bas, dans une pastille qui la détache. -->
  <rect x="90" y="470" width="486" height="82" rx="41" fill="#FFFFFF"/>
  <text x="333" y="522" font-family="Space Grotesk" font-size="34" font-weight="700"
        fill="#D42121" text-anchor="middle">Join us on VocMe</text>
</svg>`;
};

/**
 * La page servie au robot.
 *
 * Elle ne remplace pas l'application : le robot est le seul à la recevoir. Un
 * humain qui atterrirait ici malgré tout — un partage recopié, un agent
 * inhabituel — repart aussitôt vers l'application par la redirection, et par
 * le lien s'il l'a désactivée.
 */
export const buildCrawlerHtml = (opts: {
  title: string;
  description: string;
  image: string;
  url: string;
}): string => {
  const t = escapeXml(opts.title);
  const d = escapeXml(opts.description);
  const i = escapeXml(opts.image);
  const u = escapeXml(opts.url);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>${t}</title>
    <meta name="description" content="${d}" />

    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="VocMe" />
    <meta property="og:title" content="${t}" />
    <meta property="og:description" content="${d}" />
    <meta property="og:url" content="${u}" />
    <meta property="og:image" content="${i}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${t}" />

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${t}" />
    <meta name="twitter:description" content="${d}" />
    <meta name="twitter:image" content="${i}" />

    <meta http-equiv="refresh" content="0; url=${u}" />
  </head>
  <body>
    <p><a href="${u}">${t}</a></p>
  </body>
</html>`;
};

/**
 * Lit l'invitation depuis Supabase, avec la clé publique.
 *
 * `group_invite_preview` est accordée à `anon` précisément pour ça : montrer
 * une invitation à qui n'a pas de compte. Le robot d'une messagerie est le cas
 * limite de cette règle — il n'a même pas de navigateur.
 *
 * `fetchImpl` en paramètre pour que le chemin d'erreur se teste sans réseau :
 * un aperçu doit se dégrader en carte générique, jamais échouer.
 */
export const fetchGroupCard = async (
  code: string,
  env: { url?: string; key?: string },
  fetchImpl: typeof fetch = fetch
): Promise<GroupCard | null> => {
  if (!code || !env.url || !env.key) return null;
  try {
    const res = await fetchImpl(`${env.url.replace(/\/+$/, "")}/rest/v1/rpc/group_invite_preview`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: env.key,
        Authorization: `Bearer ${env.key}`,
      },
      body: JSON.stringify({ code }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as GroupCard | null;
    return data && typeof data.name === "string" ? data : null;
  } catch {
    // Supabase injoignable : mieux vaut la carte générique de VocMe qu'un
    // aperçu cassé, ou pire, une page d'erreur partagée dans une conversation.
    return null;
  }
};
