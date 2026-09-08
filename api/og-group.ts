import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { buildCardSvg, fetchGroupCard } from "./_share";

/**
 * L'image de l'aperçu, dessinée pour un groupe donné.
 *
 * Rendue ici et non préparée à l'avance : le nom du groupe est dedans, et il
 * n'existe qu'au moment où quelqu'un partage le lien.
 *
 * Les polices sont EMBARQUÉES et les polices système désactivées. C'est le
 * point sur lequel ce genre de fonction échoue en silence : l'image d'un
 * hébergeur ne contient presque aucune police, et un rendu qui s'appuie
 * dessus donne une carte au texte invisible — sans la moindre erreur, donc
 * sans que personne ne le voie avant que l'aperçu ne soit déjà parti dans une
 * conversation.
 */

interface Req {
  query: Record<string, string | string[] | undefined>;
}
interface Res {
  status: (code: number) => Res;
  setHeader: (name: string, value: string) => void;
  send: (body: Buffer) => void;
}

const first = (v: string | string[] | undefined): string =>
  (Array.isArray(v) ? v[0] : v) ?? "";

/**
 * Les polices, par chemin de fichier.
 *
 * `fontFiles` et non un tampon mémoire : `fontBuffers` n'existe pas dans cette
 * version de resvg, et une option inconnue est ignorée SANS ERREUR — le rendu
 * retombe alors sur les polices du système, qui ne sont pas les mêmes ici et
 * chez l'hébergeur. C'est la panne qu'on ne voit qu'une fois l'aperçu parti
 * dans une conversation.
 *
 * `includeFiles` dans `vercel.json` garantit que ces deux fichiers montent
 * bien avec la fonction : rien dans le code ne les référence d'une manière que
 * l'analyse de dépendances saurait suivre.
 */
const FONTS = [
  join(process.cwd(), "api/assets/SpaceGrotesk-Bold.ttf"),
  join(process.cwd(), "api/assets/SpaceGrotesk-Regular.ttf"),
];

export const renderCard = (svg: string, fontFiles: string[] = FONTS): Buffer =>
  new Resvg(svg, {
    fitTo: { mode: "width", value: 1200 },
    font: {
      fontFiles,
      // Coupé net : sans ça, une police manquante passerait inaperçue ici et
      // donnerait une carte au texte absent en production.
      loadSystemFonts: false,
      defaultFontFamily: "Space Grotesk",
    },
  })
    .render()
    .asPng();

export default async function handler(req: Req, res: Res) {
  const code = first(req.query.code).trim().toUpperCase();

  const card = await fetchGroupCard(code, {
    url: process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
    key: process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY,
  });

  const png = renderCard(buildCardSvg(card));

  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=3600");
  res.status(200).send(png);
}
