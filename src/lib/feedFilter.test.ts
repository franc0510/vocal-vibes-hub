import { describe, it, expect } from "vitest";
import { narrowsFeed, selectFeed, type FilterablePost } from "./feedFilter";

/**
 * Le bug rapporté : « je dépose un vocme sur un groupe, je ne le vois pas ».
 *
 * Il ne venait ni de l'enregistrement ni de la base — l'anecdote était bien
 * écrite avec son `group_id`. Il venait de CE QU'ON FILTRE : `useVoicePosts`
 * charge tout le feed mais n'en expose que les cinq premiers, et l'écran
 * filtrait ces cinq-là. Une anecdote de groupe n'apparaissait donc que si elle
 * tombait par hasard dans les cinq premières du feed global.
 */

const post = (over: Partial<FilterablePost> & { id: string }): FilterablePost & { id: string } => ({
  user_id: "moi",
  group_id: null,
  created_at: "2026-09-01T10:00:00Z",
  ...over,
});

/** Un feed réaliste : beaucoup de public, une anecdote de groupe enfouie. */
const fullFeed = [
  ...Array.from({ length: 12 }, (_, i) =>
    post({ id: `public-${i}`, user_id: "quelqun", created_at: `2026-09-0${(i % 9) + 1}T10:00:00Z` })
  ),
  post({ id: "du-groupe", group_id: "g1", created_at: "2026-09-08T10:00:00Z" }),
];

const REVEALED = 5;

describe("l'anecdote déposée sur un groupe", () => {
  /**
   * LA RÉGRESSION. Ce test échouerait sur le code d'avant : il filtrait la
   * fenêtre révélée, et l'onglet « Group » restait vide — définitivement, la
   * suite ne se chargeant qu'en approchant de la fin d'une liste… vide.
   */
  it("est introuvable si l'on ne filtre que les cinq anecdotes révélées", () => {
    const fenetre = fullFeed.slice(0, REVEALED);
    expect(selectFeed(fenetre, { filterGroupId: "g1" })).toHaveLength(0);
  });

  it("apparaît dès qu'on filtre la liste entière", () => {
    const vus = selectFeed(fullFeed, { filterGroupId: "g1" });
    expect(vus.map((p) => p.id)).toEqual(["du-groupe"]);
  });

  /** D'où la règle que l'écran doit suivre. */
  it("oblige donc à charger tout le feed avant de filtrer", () => {
    expect(narrowsFeed({ filterGroupId: "g1" })).toBe(true);
  });
});

describe("narrowsFeed distingue le fini de l'infini", () => {
  it("un groupe, tous les groupes, les amis, un auteur : des ensembles finis", () => {
    expect(narrowsFeed({ filterGroupId: "g1" })).toBe(true);
    expect(narrowsFeed({ filterAllGroups: true })).toBe(true);
    expect(narrowsFeed({ filterFriends: true })).toBe(true);
    expect(narrowsFeed({ filterUserId: "moi" })).toBe(true);
  });

  /** Le feed sans filtre, lui, garde sa révélation par paquets de cinq. */
  it("« For you » n'est pas restreint", () => {
    expect(narrowsFeed({})).toBe(false);
    expect(narrowsFeed({ filterAllGroups: false, filterFriends: false })).toBe(false);
  });
});

describe("chaque onglet montre ce qu'il annonce", () => {
  const feed = [
    post({ id: "public-ami", user_id: "ami", created_at: "2026-09-03T10:00:00Z" }),
    post({ id: "public-inconnu", user_id: "inconnu" }),
    post({ id: "groupe-1", user_id: "ami", group_id: "g1" }),
    post({ id: "groupe-2", user_id: "inconnu", group_id: "g2" }),
    post({ id: "mien-public", user_id: "moi", created_at: "2026-09-05T10:00:00Z" }),
    post({ id: "mien-groupe", user_id: "moi", group_id: "g1" }),
  ];

  it("« For you » cache ce qui appartient à un groupe", () => {
    expect(selectFeed(feed, {}).map((p) => p.id)).toEqual([
      "public-ami",
      "public-inconnu",
      "mien-public",
    ]);
  });

  it("un groupe précis ne montre que le sien", () => {
    expect(selectFeed(feed, { filterGroupId: "g1" }).map((p) => p.id)).toEqual([
      "groupe-1",
      "mien-groupe",
    ]);
  });

  it("« tous les groupes » les mêle sans laisser entrer le public", () => {
    expect(selectFeed(feed, { filterAllGroups: true }).map((p) => p.id)).toEqual([
      "groupe-1",
      "groupe-2",
      "mien-groupe",
    ]);
  });

  it("un profil montre ses anecdotes publiques, du plus récent au plus ancien", () => {
    // Les anecdotes de groupe restent hors du profil : elles appartiennent à
    // leur groupe, pas à la vitrine publique de leur auteur.
    expect(selectFeed(feed, { filterUserId: "moi" }).map((p) => p.id)).toEqual(["mien-public"]);
  });

  it("un profil se lit du plus récent au plus ancien", () => {
    const deux = [
      post({ id: "vieille", user_id: "moi", created_at: "2026-09-01T10:00:00Z" }),
      post({ id: "recente", user_id: "moi", created_at: "2026-09-07T10:00:00Z" }),
    ];
    expect(selectFeed(deux, { filterUserId: "moi" }).map((p) => p.id)).toEqual([
      "recente",
      "vieille",
    ]);
  });

  it("les amis, tels que l'écran les montrait déjà", () => {
    expect(selectFeed(feed, { filterFriends: true }, ["ami"]).map((p) => p.id)).toEqual([
      "public-ami",
      "groupe-1",
    ]);
  });

  it("sans ami, l'onglet est vide plutôt que plein", () => {
    expect(selectFeed(feed, { filterFriends: true }, [])).toHaveLength(0);
  });

  /** Un filtre l'emporte sur l'autre, dans un ordre stable. */
  it("l'auteur prime sur le groupe quand les deux sont donnés", () => {
    expect(selectFeed(feed, { filterUserId: "moi", filterGroupId: "g1" }).map((p) => p.id)).toEqual([
      "mien-public",
    ]);
  });

  it("ne modifie jamais la liste qu'on lui donne", () => {
    const avant = feed.map((p) => p.id);
    selectFeed(feed, { filterUserId: "moi" });
    expect(feed.map((p) => p.id)).toEqual(avant);
  });
});
