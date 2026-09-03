import { describe, it, expect } from "vitest";
import {
  shouldClose,
  daysToSettle,
  dayWonMessage,
  resultMessage,
} from "./competitionClosing";

/**
 * Quand clore un défi, et qui prévenir — les deux décisions qu'une tâche
 * planifiée prend toute seule, sans personne pour la relire.
 */

const PARIS = "Europe/Paris";
const comp = (over = {}) => ({
  id: "c1",
  ends_on: "2026-09-07",
  timezone: PARIS,
  closed_at: null,
  ...over,
});

describe("shouldClose", () => {
  /**
   * Le dernier jour garde ses votes jusqu'à 4 h le lendemain. Clore avant,
   * c'est le priver de son bonus — et potentiellement couronner le mauvais.
   */
  it("attend le dépouillement du dernier jour", () => {
    // 23 h le dernier jour : l'urne court encore.
    expect(shouldClose(comp(), new Date("2026-09-07T21:00:00Z"))).toBe(false);
    // 3 h du matin le lendemain : toujours pas.
    expect(shouldClose(comp(), new Date("2026-09-08T01:00:00Z"))).toBe(false);
    // 4 h 30 : l'urne est scellée, le défi peut se clore.
    expect(shouldClose(comp(), new Date("2026-09-08T02:30:00Z"))).toBe(true);
  });

  it("ne clôt pas un défi encore en cours", () => {
    expect(shouldClose(comp(), new Date("2026-09-03T12:00:00Z"))).toBe(false);
  });

  /**
   * Un classement gelé ne se recalcule pas : sans cette règle, un like posté
   * après coup pourrait changer un vainqueur déjà annoncé.
   */
  it("ne reclôt jamais un défi déjà clos", () => {
    const closed = comp({ closed_at: "2026-09-08T02:00:00Z" });
    expect(shouldClose(closed, new Date("2026-09-20T12:00:00Z"))).toBe(false);
  });

  it("suit le fuseau du défi, pas celui du serveur", () => {
    // À Tokyo (UTC+9), 4 h le 8 correspond à 19 h UTC le 7.
    const tokyo = comp({ timezone: "Asia/Tokyo" });
    expect(shouldClose(tokyo, new Date("2026-09-07T18:00:00Z"))).toBe(false);
    expect(shouldClose(tokyo, new Date("2026-09-07T20:00:00Z"))).toBe(true);
  });
});

describe("daysToSettle", () => {
  const tz = () => PARIS;
  const days = [
    { id: "d1", date: "2026-09-05", competition_id: "c1" },
    { id: "d2", date: "2026-09-06", competition_id: "c1" },
    { id: "d3", date: "2026-09-07", competition_id: "c1" },
  ];
  // 6 septembre, 12 h à Paris : d1 est dépouillé, d2 court, d3 est à venir.
  const now = new Date("2026-09-06T10:00:00Z");

  it("ne retient que les urnes scellées", () => {
    expect(daysToSettle(days, new Set(), tz, now).map((d) => d.id)).toEqual(["d1"]);
  });

  /**
   * Le registre est ce qui évite de renotifier chaque heure : la tâche
   * repasse indéfiniment sur les mêmes jours déjà dépouillés.
   */
  it("saute ce qui a déjà été annoncé", () => {
    expect(daysToSettle(days, new Set(["d1"]), tz, now)).toEqual([]);
  });

  it("ne devance jamais le dépouillement", () => {
    const early = new Date("2026-09-05T12:00:00Z");
    expect(daysToSettle(days, new Set(), tz, early)).toEqual([]);
  });
});

describe("les messages", () => {
  it("nomme le thème plutôt que le numéro du jour", () => {
    expect(dayWonMessage("Ton pire date", 20)).toBe('Your story won "Ton pire date" — +20 points.');
  });

  it("dit au vainqueur qu'il a gagné", () => {
    expect(resultMessage("Défi inter-écoles", true, null)).toBe('You won "Défi inter-écoles"!');
  });

  it("dit aux autres qui a gagné", () => {
    expect(resultMessage("Défi inter-écoles", false, "Léa")).toBe(
      '"Défi inter-écoles" is over — Léa won.'
    );
  });

  /** Une égalité ne désigne personne, et le dire vaut mieux qu'en inventer un. */
  it("annonce une égalité plutôt qu'un gagnant choisi au hasard", () => {
    expect(resultMessage("Défi inter-écoles", false, null)).toBe(
      '"Défi inter-écoles" is over — it ended in a tie.'
    );
  });
});
