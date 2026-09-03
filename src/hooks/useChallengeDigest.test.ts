import { describe, it, expect } from "vitest";
import { digestFor, sortDigests, type ChallengeDigest } from "./useChallengeDigest";
import type { Competition } from "./useCompetitions";

/**
 * Ce que la liste des défis doit dire d'un coup d'œil.
 *
 * Elle ne montrait qu'un nom et une durée : le thème du jour et les défis qui
 * réclamaient encore une anecdote demandaient d'ouvrir chaque défi l'un après
 * l'autre. Ces règles décident de ce qu'on lit en premier le matin.
 */

const comp = (over: Partial<Competition> = {}): Competition => ({
  id: "c1",
  owner_id: "o",
  name: "Défi",
  description: null,
  prize: null,
  visibility: "public",
  starts_on: "2026-09-01",
  ends_on: "2026-09-07",
  timezone: "Europe/Paris",
  join_code: "ABC123",
  template_key: null,
  closed_at: null,
  scoring: {},
  final_standings: null,
  ...over,
});

const day = { id: "d1", day_index: 3, theme: "Ton pire date" };

describe("digestFor", () => {
  it("classe un défi qui court", () => {
    const d = digestFor(comp(), day, false, "2026-09-03");
    expect(d.state).toBe("live");
    expect(d.theme).toBe("Ton pire date");
    expect(d.dayIndex).toBe(3);
  });

  it("classe un défi qui n'a pas commencé", () => {
    const d = digestFor(comp({ starts_on: "2026-09-10", ends_on: "2026-09-16" }), null, false, "2026-09-03");
    expect(d.state).toBe("upcoming");
    expect(d.theme).toBeNull();
  });

  it("classe un défi terminé par sa date de fin", () => {
    expect(digestFor(comp({ ends_on: "2026-09-02" }), null, false, "2026-09-03").state).toBe("over");
  });

  it("classe un défi clos avant même sa date de fin", () => {
    expect(digestFor(comp({ closed_at: "2026-09-02T12:00:00Z" }), day, false, "2026-09-03").state).toBe("over");
  });

  /** Le cœur de la demande : voir d'un coup ce qui réclame une action. */
  describe("needsMe", () => {
    it("réclame quand le défi court et que je n'ai pas publié", () => {
      expect(digestFor(comp(), day, false, "2026-09-03").needsMe).toBe(true);
    });

    it("ne réclame plus une fois que j'ai publié", () => {
      expect(digestFor(comp(), day, true, "2026-09-03").needsMe).toBe(false);
    });

    it("ne réclame rien d'un défi qui n'a pas commencé", () => {
      const d = digestFor(comp({ starts_on: "2026-09-10", ends_on: "2026-09-16" }), null, false, "2026-09-03");
      expect(d.needsMe).toBe(false);
    });

    it("ne réclame rien d'un défi terminé", () => {
      expect(digestFor(comp({ ends_on: "2026-09-02" }), day, false, "2026-09-03").needsMe).toBe(false);
    });

    /**
     * Un défi sans jour aujourd'hui — celui dont les jours ont échoué à la
     * création — ne doit pas réclamer une anecdote qu'on ne peut pas publier.
     */
    it("ne réclame rien quand il n'y a pas de thème aujourd'hui", () => {
      expect(digestFor(comp(), null, false, "2026-09-03").needsMe).toBe(false);
    });
  });
});

describe("sortDigests", () => {
  it("met en tête ce qui réclame une anecdote", () => {
    const done = digestFor(comp({ id: "a", ends_on: "2026-09-05" }), day, true, "2026-09-03");
    const todo = digestFor(comp({ id: "b", ends_on: "2026-09-20" }), day, false, "2026-09-03");
    expect(sortDigests([done, todo]).map((d) => d.competition.id)).toEqual(["b", "a"]);
  });

  it("à égalité, celui qui se termine le plus tôt d'abord", () => {
    const late = digestFor(comp({ id: "late", ends_on: "2026-09-20" }), day, true, "2026-09-03");
    const soon = digestFor(comp({ id: "soon", ends_on: "2026-09-05" }), day, true, "2026-09-03");
    expect(sortDigests([late, soon]).map((d) => d.competition.id)).toEqual(["soon", "late"]);
  });

  it("ne modifie pas la liste qu'on lui donne", () => {
    const list: ChallengeDigest[] = [
      digestFor(comp({ id: "a", ends_on: "2026-09-20" }), day, true, "2026-09-03"),
      digestFor(comp({ id: "b", ends_on: "2026-09-05" }), day, false, "2026-09-03"),
    ];
    sortDigests(list);
    expect(list.map((d) => d.competition.id)).toEqual(["a", "b"]);
  });
});
