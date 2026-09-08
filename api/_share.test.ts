import { describe, it, expect, vi } from "vitest";
import { existsSync } from "node:fs";
import {
  buildCardSvg,
  buildCrawlerHtml,
  cardDescription,
  cardTitle,
  escapeXml,
  fetchGroupCard,
  fitFontSize,
  truncate,
} from "./_share";
import { renderCard } from "./og-group";

/**
 * Un aperçu de lien est public, définitif, et vu par tout un groupe.
 *
 * Les messageries gardent en cache ce qu'elles ont vu la première fois : un
 * aperçu cassé ne se rattrape pas d'un correctif, il reste dans la
 * conversation. D'où des vérifications sur ce qui casse vraiment — un nom
 * hostile, un nom trop long, Supabase muet, et la police absente.
 */

const card = {
  name: "Cohabs",
  member_count: 4,
  owner_name: "Camille",
  owner_username: "camille",
};

describe("les textes de l'aperçu", () => {
  it("met le nom du groupe dans le titre, avec l'invitation", () => {
    expect(cardTitle(card)).toBe("Cohabs · Join us on VocMe");
  });

  it("annonce qui invite et combien ils sont", () => {
    expect(cardDescription(card)).toContain("Camille · 4 members");
  });

  it("accorde le singulier", () => {
    expect(cardDescription({ ...card, member_count: 1 })).toContain("1 member.");
  });

  it("se rabat sur le pseudo quand le nom manque", () => {
    expect(cardDescription({ ...card, owner_name: null })).toContain("@camille");
  });

  it("se passe d'hôte quand on n'en connaît aucun", () => {
    const anonyme = { ...card, owner_name: null, owner_username: null };
    expect(cardDescription(anonyme)).toContain("4 members");
    expect(cardDescription(anonyme)).not.toContain("·");
  });

  it("coupe un nom interminable au lieu de le laisser déborder", () => {
    expect(truncate("a".repeat(90), 60)).toHaveLength(60);
    expect(cardTitle({ ...card, name: "b".repeat(200) })).toContain("…");
  });
});

/**
 * Le nom d'un groupe est écrit par ses membres : il peut contenir n'importe
 * quoi. Un `<` non échappé rend le SVG illisible — donc l'aperçu vide — et le
 * même caractère dans la page servie au robot y ouvrirait une balise.
 */
describe("le texte des membres ne casse pas le document", () => {
  const hostile = { ...card, name: '"><script>alert(1)</script> & co' };

  it("échappe ce qui pourrait fermer une balise", () => {
    expect(escapeXml('<a href="x">&\'')).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
  });

  it("n'écrit jamais de balise ouverte dans la carte", () => {
    const svg = buildCardSvg(hostile);
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
  });

  it("n'écrit jamais de balise ouverte dans la page du robot", () => {
    const html = buildCrawlerHtml({
      title: cardTitle(hostile),
      description: cardDescription(hostile),
      image: "https://exemple/og.png",
      url: "https://exemple/join-group/ABC123",
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("la carte s'adapte à la longueur du nom", () => {
  it("laisse un nom court en grand", () => {
    expect(fitFontSize("Wei")).toBe(96);
  });

  it("rétrécit un nom long", () => {
    expect(fitFontSize("Les anciens du lycée Jean-Moulin")).toBeLessThan(96);
  });

  it("ne descend jamais sous le lisible", () => {
    expect(fitFontSize("x".repeat(300))).toBe(46);
  });
});

describe("la page servie au robot", () => {
  const html = buildCrawlerHtml({
    title: "Cohabs · Join us on VocMe",
    description: "Rejoins",
    image: "https://exemple/og.png",
    url: "https://exemple/join-group/ABC123",
  });

  it("porte les balises que lisent les messageries", () => {
    expect(html).toContain('<meta property="og:title" content="Cohabs · Join us on VocMe" />');
    expect(html).toContain('<meta property="og:image" content="https://exemple/og.png" />');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(html).toContain('<meta property="og:image:width" content="1200" />');
  });

  /** Un humain qui atterrirait là ne doit pas y rester. */
  it("renvoie vers l'application", () => {
    expect(html).toContain('http-equiv="refresh"');
    expect(html).toContain('href="https://exemple/join-group/ABC123"');
  });
});

describe("la lecture de l'invitation se dégrade sans casser", () => {
  const env = { url: "https://projet.supabase.co", key: "cle-publique" };

  it("rend la carte quand Supabase répond", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => card });
    await expect(fetchGroupCard("ABC123", env, fetchImpl as never)).resolves.toEqual(card);

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://projet.supabase.co/rest/v1/rpc/group_invite_preview");
    expect(JSON.parse((init as { body: string }).body)).toEqual({ code: "ABC123" });
  });

  it("rend null sur un code inconnu", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => null });
    await expect(fetchGroupCard("ZZZZZZ", env, fetchImpl as never)).resolves.toBeNull();
  });

  it("rend null quand Supabase refuse", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) });
    await expect(fetchGroupCard("ABC123", env, fetchImpl as never)).resolves.toBeNull();
  });

  /** Réseau coupé : une carte générique, jamais une page d'erreur partagée. */
  it("rend null quand le réseau tombe", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("réseau"));
    await expect(fetchGroupCard("ABC123", env, fetchImpl as never)).resolves.toBeNull();
  });

  it("n'appelle rien sans configuration", async () => {
    const fetchImpl = vi.fn();
    await expect(fetchGroupCard("ABC123", {}, fetchImpl as never)).resolves.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("dessine quand même une carte sans invitation", () => {
    expect(buildCardSvg(null)).toContain("VocMe");
  });
});

/**
 * LE PIÈGE DE CETTE FONCTIONNALITÉ.
 *
 * Une police manquante ne lève aucune erreur : resvg dessine la carte, le
 * dégradé, la pastille — et pas une lettre. La première version de ce code
 * passait `fontBuffers`, qui n'existe pas dans cette version de resvg : option
 * ignorée en silence, rendu correct sur ma machine grâce aux polices système,
 * et texte invisible chez l'hébergeur, qui n'en a pas.
 *
 * Ce test compare le rendu AVEC et SANS les fichiers de police. S'ils sont
 * identiques, c'est que ce ne sont pas eux qui écrivent — et l'aperçu partirait
 * muet.
 */
describe("la police embarquée est bien celle qui écrit", () => {
  const svg = buildCardSvg(card);

  it("les deux fichiers montent avec la fonction", () => {
    expect(existsSync("api/assets/SpaceGrotesk-Bold.ttf")).toBe(true);
    expect(existsSync("api/assets/SpaceGrotesk-Regular.ttf")).toBe(true);
  });

  it("produit un vrai PNG", () => {
    const png = renderCard(svg);
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(png.length).toBeGreaterThan(10_000);
  });

  it("sans elles, la carte perd son texte", () => {
    const avec = renderCard(svg);
    const sans = renderCard(svg, []);
    expect(sans.equals(avec)).toBe(false);
    // Moins de glyphes, donc moins de pixels à coder : l'écart se voit.
    expect(sans.length).toBeLessThan(avec.length);
  });
});
