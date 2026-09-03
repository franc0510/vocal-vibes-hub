import { describe, it, expect } from "vitest";
import {
  ROLLOVER_HOUR,
  competitionDate,
  ballotIsSettled,
  ballotIsOpen,
  msUntilRollover,
  formatCountdown,
  instantAt,
  themeIsRevealed,
  addDays,
} from "./competitionClock";

/**
 * La pendule décide de tout : quel thème s'affiche, quelle urne est ouverte,
 * quel bonus est acquis. Une erreur d'un jour ici déplace des points.
 *
 * Les instants sont donnés en UTC (`Z`) et lus dans un fuseau : c'est
 * exactement la situation du téléphone, dont l'horloge interne est en UTC.
 */

const PARIS = "Europe/Paris";

describe("competitionDate — le jour bascule à 4 h", () => {
  it("bascule à 4 h et pas avant", () => {
    // Hiver : Paris = UTC+1.
    expect(competitionDate(new Date("2026-01-15T02:59:00Z"), PARIS)).toBe("2026-01-14");
    expect(competitionDate(new Date("2026-01-15T03:00:00Z"), PARIS)).toBe("2026-01-15");
  });

  it("compte 3 h 59 du matin comme la veille", () => {
    // 03 h 59 à Paris en hiver = 02 h 59 UTC.
    expect(competitionDate(new Date("2026-01-15T02:59:00Z"), PARIS)).toBe("2026-01-14");
  });

  it("compte l'après-midi et le soir comme le jour même", () => {
    expect(competitionDate(new Date("2026-01-15T13:00:00Z"), PARIS)).toBe("2026-01-15");
    expect(competitionDate(new Date("2026-01-15T22:30:00Z"), PARIS)).toBe("2026-01-15");
  });

  /**
   * Le bug que l'ancien code portait sans le savoir.
   *
   * `new Date().toISOString().slice(0, 10)` rend la date UTC. À 1 h du matin à
   * Paris en été, l'instant UTC est encore la veille à 23 h : l'ancien calcul
   * annonçait donc le mauvais jour, et le thème sautait. La règle des 4 h
   * couvre ce cas au passage, mais pas pour la même raison — d'où ce test.
   */
  it("ne se laisse pas prendre par la date UTC en soirée d'été", () => {
    // Été : Paris = UTC+2. 00 h 30 le 16 à Paris = 22 h 30 le 15 en UTC.
    const instant = new Date("2026-07-15T22:30:00Z");
    expect(instant.toISOString().slice(0, 10)).toBe("2026-07-15");
    // Il est 00 h 30 le 16 à Paris, donc avant 4 h : la journée du 15 court
    // toujours. La date UTC tombait juste ici par accident.
    expect(competitionDate(instant, PARIS)).toBe("2026-07-15");
  });

  it("rend la veille quand l'heure UTC a déjà changé de jour mais pas Paris", () => {
    // 23 h 30 le 15 à Paris (été) = 21 h 30 UTC : même jour partout.
    expect(competitionDate(new Date("2026-07-15T21:30:00Z"), PARIS)).toBe("2026-07-15");
    // 02 h 00 le 16 à Paris (été) = 00 h 00 UTC le 16 : UTC dit « 16 »,
    // la compétition dit encore « 15 ».
    expect(competitionDate(new Date("2026-07-16T00:00:00Z"), PARIS)).toBe("2026-07-15");
  });

  describe("les deux nuits de changement d'heure", () => {
    it("passage à l'heure d'été — la nuit où 2 h devient 3 h", () => {
      // 2026-03-29 : à 02 h 00, Paris passe directement à 03 h 00.
      // 01 h 30 locale (00 h 30 UTC) : avant 4 h, donc encore le 28.
      expect(competitionDate(new Date("2026-03-29T00:30:00Z"), PARIS)).toBe("2026-03-28");
      // 03 h 30 locale (01 h 30 UTC) : toujours avant 4 h, encore le 28.
      expect(competitionDate(new Date("2026-03-29T01:30:00Z"), PARIS)).toBe("2026-03-28");
      // 04 h 30 locale (02 h 30 UTC) : la bascule a eu lieu.
      expect(competitionDate(new Date("2026-03-29T02:30:00Z"), PARIS)).toBe("2026-03-29");
    });

    it("passage à l'heure d'hiver — la nuit où 3 h redevient 2 h", () => {
      // 2026-10-25 : 02 h 00 UTC+2 revient à 02 h 00 UTC+1.
      // 02 h 30 locale, première occurrence (00 h 30 UTC) : avant 4 h.
      expect(competitionDate(new Date("2026-10-25T00:30:00Z"), PARIS)).toBe("2026-10-24");
      // 02 h 30 locale, seconde occurrence (01 h 30 UTC) : toujours avant 4 h.
      expect(competitionDate(new Date("2026-10-25T01:30:00Z"), PARIS)).toBe("2026-10-24");
      // 04 h 30 locale (03 h 30 UTC) : bascule.
      expect(competitionDate(new Date("2026-10-25T03:30:00Z"), PARIS)).toBe("2026-10-25");
    });
  });

  it("suit le fuseau déclaré, pas celui du téléphone", () => {
    const instant = new Date("2026-01-15T12:00:00Z"); // 13 h à Paris, 04 h à Los Angeles
    expect(competitionDate(instant, PARIS)).toBe("2026-01-15");
    expect(competitionDate(instant, "America/Los_Angeles")).toBe("2026-01-15");
    // Une heure plus tôt, il est 03 h à Los Angeles : encore la veille là-bas,
    // déjà midi passé à Paris.
    const earlier = new Date("2026-01-15T11:00:00Z");
    expect(competitionDate(earlier, PARIS)).toBe("2026-01-15");
    expect(competitionDate(earlier, "America/Los_Angeles")).toBe("2026-01-14");
  });

  it("retombe sur UTC plutôt que de lever, si le fuseau est illisible", () => {
    // Une compétition mal configurée doit rester lisible.
    expect(competitionDate(new Date("2026-01-15T12:00:00Z"), "Mars/Olympus")).toBe("2026-01-15");
  });

  it("expose l'heure de bascule retenue", () => {
    expect(ROLLOVER_HOUR).toBe(4);
  });
});

describe("l'urne : ouverte, puis dépouillée", () => {
  const midDay = new Date("2026-01-15T13:00:00Z"); // le 15 court

  it("le jour qui court est ouvert et non dépouillé", () => {
    expect(ballotIsOpen("2026-01-15", midDay, PARIS)).toBe(true);
    expect(ballotIsSettled("2026-01-15", midDay, PARIS)).toBe(false);
  });

  it("la veille est dépouillée, et fermée au vote", () => {
    expect(ballotIsSettled("2026-01-14", midDay, PARIS)).toBe(true);
    expect(ballotIsOpen("2026-01-14", midDay, PARIS)).toBe(false);
  });

  it("un jour à venir n'est ni ouvert ni dépouillé", () => {
    expect(ballotIsOpen("2026-01-16", midDay, PARIS)).toBe(false);
    expect(ballotIsSettled("2026-01-16", midDay, PARIS)).toBe(false);
  });

  /**
   * L'heure qui compte le plus : à 3 h 30, l'urne de la veille est encore
   * ouverte. C'est toute la raison d'être de la règle des 4 h.
   */
  it("laisse voter jusqu'à 4 h sur la journée qui vient de s'écouler", () => {
    const lateNight = new Date("2026-01-16T02:30:00Z"); // 03 h 30 à Paris
    expect(ballotIsOpen("2026-01-15", lateNight, PARIS)).toBe(true);
    expect(ballotIsSettled("2026-01-15", lateNight, PARIS)).toBe(false);

    const afterRollover = new Date("2026-01-16T03:30:00Z"); // 04 h 30 à Paris
    expect(ballotIsOpen("2026-01-15", afterRollover, PARIS)).toBe(false);
    expect(ballotIsSettled("2026-01-15", afterRollover, PARIS)).toBe(true);
  });
});

describe("msUntilRollover", () => {
  it("compte les heures qui restent avant 4 h", () => {
    // 13 h 00 à Paris → 15 h jusqu'à 4 h le lendemain.
    const ms = msUntilRollover(new Date("2026-01-15T12:00:00Z"), PARIS);
    expect(ms / 3_600_000).toBeCloseTo(15, 5);
  });

  it("compte les minutes qui restent quand on est déjà après minuit", () => {
    // 03 h 30 à Paris → 30 minutes.
    const ms = msUntilRollover(new Date("2026-01-15T02:30:00Z"), PARIS);
    expect(ms / 60_000).toBeCloseTo(30, 5);
  });

  it("rend 24 h pile à l'instant de la bascule", () => {
    const ms = msUntilRollover(new Date("2026-01-15T03:00:00Z"), PARIS);
    expect(ms / 3_600_000).toBeCloseTo(24, 5);
  });
});

describe("formatCountdown", () => {
  it("dit les minutes sous l'heure", () => {
    expect(formatCountdown(47 * 60_000)).toBe("47 min");
  });

  it("dit les heures et les minutes au-delà", () => {
    expect(formatCountdown((3 * 60 + 12) * 60_000)).toBe("3 h 12");
  });

  it("omet les minutes quand il n'y en a pas", () => {
    expect(formatCountdown(5 * 3_600_000)).toBe("5 h");
  });

  it("ne descend jamais sous zéro", () => {
    expect(formatCountdown(-10_000)).toBe("0 min");
  });
});

describe("instantAt — l'heure murale d'un fuseau, ramenée à un instant", () => {
  const PARIS_TZ = "Europe/Paris";

  it("vise 9 h locale en hiver (Paris = UTC+1)", () => {
    const at = instantAt("2026-01-15", 9, PARIS_TZ);
    expect(at.toISOString()).toBe("2026-01-15T08:00:00.000Z");
  });

  it("vise 9 h locale en été (Paris = UTC+2)", () => {
    const at = instantAt("2026-07-15", 9, PARIS_TZ);
    expect(at.toISOString()).toBe("2026-07-15T07:00:00.000Z");
  });

  /**
   * Le jour du changement d'heure : c'est là qu'un décalage codé en dur se
   * trompe d'une heure, et qu'une notification arrive à 8 h ou à 10 h.
   */
  it("tient le jour du passage à l'heure d'été", () => {
    // 2026-03-29 : Paris passe de UTC+1 à UTC+2 à 2 h du matin. À 9 h, on est
    // déjà en heure d'été.
    expect(instantAt("2026-03-29", 9, PARIS_TZ).toISOString()).toBe("2026-03-29T07:00:00.000Z");
    // La veille, encore en heure d'hiver.
    expect(instantAt("2026-03-28", 9, PARIS_TZ).toISOString()).toBe("2026-03-28T08:00:00.000Z");
  });

  it("tient le jour du passage à l'heure d'hiver", () => {
    // 2026-10-25 : Paris repasse à UTC+1 à 3 h du matin.
    expect(instantAt("2026-10-25", 9, PARIS_TZ).toISOString()).toBe("2026-10-25T08:00:00.000Z");
    expect(instantAt("2026-10-24", 9, PARIS_TZ).toISOString()).toBe("2026-10-24T07:00:00.000Z");
  });

  it("suit le fuseau déclaré, pas celui du téléphone", () => {
    expect(instantAt("2026-01-15", 9, "America/Los_Angeles").toISOString())
      .toBe("2026-01-15T17:00:00.000Z");
    expect(instantAt("2026-01-15", 9, "Asia/Tokyo").toISOString())
      .toBe("2026-01-15T00:00:00.000Z");
  });

  /**
   * La propriété qui rend 9 h sûr : l'heure visée existe toujours. Les
   * bascules se jouent entre 2 h et 3 h ; à 9 h il n'y a jamais d'heure
   * manquante ni d'heure jouée deux fois.
   */
  it("relit bien 9 h dans le fuseau, tous les jours d'une année", () => {
    for (let d = 0; d < 365; d++) {
      const date = new Date(Date.UTC(2026, 0, 1 + d)).toISOString().slice(0, 10);
      const at = instantAt(date, 9, PARIS_TZ);
      const readBack = new Intl.DateTimeFormat("en-US", {
        timeZone: PARIS_TZ, hour: "2-digit", hourCycle: "h23",
      }).format(at);
      expect(`${date} → ${readBack}`).toBe(`${date} → 09`);
    }
  });
});

describe("themeIsRevealed", () => {
  it("révèle le thème du jour et ceux d'avant", () => {
    expect(themeIsRevealed("2026-01-15", "2026-01-15")).toBe(true);
    expect(themeIsRevealed("2026-01-14", "2026-01-15")).toBe(true);
  });

  it("garde les jours à venir secrets", () => {
    expect(themeIsRevealed("2026-01-16", "2026-01-15")).toBe(false);
  });
});

describe("addDays — l'arithmétique de calendrier, hors de tout fuseau", () => {
  it("avance d'un jour", () => {
    expect(addDays("2026-09-03", 1)).toBe("2026-09-04");
  });

  it("rend la même date pour zéro", () => {
    expect(addDays("2026-09-03", 0)).toBe("2026-09-03");
  });

  it("franchit les mois et les années", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29"); // année bissextile
  });

  it("recule aussi", () => {
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("couvre une semaine complète, comme un défi de sept jours", () => {
    const start = "2026-09-03";
    expect([0, 1, 2, 3, 4, 5, 6].map((i) => addDays(start, i))).toEqual([
      "2026-09-03", "2026-09-04", "2026-09-05", "2026-09-06",
      "2026-09-07", "2026-09-08", "2026-09-09",
    ]);
  });

  /**
   * Le test qui compte, et celui qui manquait.
   *
   * L'ancien calcul passait par `new Date(\`${d}T00:00:00\`)`, interprété en
   * heure locale : à Paris, « aujourd'hui » devenait « hier » au moment de
   * l'écriture, la base refusait le jour 1 et la création échouait en bloc.
   * En UTC le calcul tombait juste — d'où un bug qu'aucun test ne voyait.
   *
   * `addDays` ne doit dépendre du fuseau du téléphone d'aucune manière.
   */
  it("donne le même résultat quel que soit le fuseau de l'appareil", () => {
    // Le passage à l'heure d'été, à travers minuit, dans les deux sens.
    const cases = ["2026-03-29", "2026-10-25", "2026-01-01", "2026-07-15"];
    for (const day of cases) {
      // Une date civile n'a pas d'heure : le résultat ne peut donc pas bouger
      // selon l'endroit d'où on la lit.
      expect(addDays(day, 1)).toBe(
        new Date(Date.UTC(
          Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10))
        ) + 86_400_000).toISOString().slice(0, 10)
      );
    }
  });

  it("ne rend jamais la veille pour un décalage de zéro — le bug d'origine", () => {
    // Reproduction exacte : à Paris, `new Date("2026-09-03T00:00:00")` est le
    // 2 septembre à 22 h UTC. `addDays` ne s'y laisse pas prendre.
    for (const day of ["2026-09-03", "2026-06-21", "2026-12-25"]) {
      expect(addDays(day, 0)).toBe(day);
    }
  });
});
