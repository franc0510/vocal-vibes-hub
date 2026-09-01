import { describe, it, expect } from "vitest";
import { TEMPLATES, fromTemplate } from "./competitionTemplates";

describe("les modèles", () => {
  it("porte les sept thèmes du premier défi, dans l'ordre annoncé", () => {
    const themes = TEMPLATES.find((t) => t.key === "inter-ecoles")!.default_days;
    expect(themes.map((d) => d.theme)).toEqual([
      "Ton pire date",
      "Ta meilleure anecdote avec la police",
      "Ta meilleure anecdote de soirée",
      "Ton moment le plus honteux",
      "Ta meilleure anecdote coquine",
      "Ta meilleure blague",
      "Ta meilleure anecdote — carte joker",
    ]);
    expect(themes.map((d) => d.day_index)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("n'a pas deux fois la même clé", () => {
    expect(new Set(TEMPLATES.map((t) => t.key)).size).toBe(TEMPLATES.length);
  });

  it("donne à chaque modèle des coefficients complets", () => {
    // Un coefficient absent retomberait sur la valeur par défaut plutôt que
    // sur celle du modèle — le modèle mentirait sans rien casser.
    for (const t of TEMPLATES) {
      expect(Object.keys(t.default_scoring).sort()).toEqual(
        ["bonus", "comments", "likes", "members", "posts", "shares"]
      );
    }
  });
});

describe("fromTemplate", () => {
  const start = new Date("2026-10-05T00:00:00Z");

  it("cale la fin sur le nombre de jours, sans durée en dur", () => {
    const ecoles = fromTemplate(TEMPLATES.find((t) => t.key === "inter-ecoles")!, start);
    expect(ecoles.starts_on).toBe("2026-10-05");
    expect(ecoles.ends_on).toBe("2026-10-11");
    expect(ecoles.days).toHaveLength(7);
    expect(ecoles.days[6].date).toBe("2026-10-11");
  });

  it("monte le mariage sur trois jours et deux camps, sans une ligne de code", () => {
    // Le contrôle qui dit si le moteur est général : si ce modèle demandait la
    // moindre condition particulière, il faudrait le corriger avant le premier
    // défi, pas après.
    const mariage = fromTemplate(TEMPLATES.find((t) => t.key === "mariage")!, start);
    expect(mariage.days).toHaveLength(3);
    expect(mariage.ends_on).toBe("2026-10-07");
    expect(mariage.teams.map((t) => t.name)).toEqual(["Team mariée", "Team marié"]);
  });

  it("ne propose aucune équipe quand le modèle joue en solo", () => {
    const amis = fromTemplate(TEMPLATES.find((t) => t.key === "entre-amis")!, start);
    expect(amis.teams).toEqual([]);
    expect(amis.scoring.members).toBe(0);
  });

  it("garde le lien au modèle comme une origine, pas comme une dépendance", () => {
    const t = fromTemplate(TEMPLATES[0], start);
    expect(t.template_key).toBe("inter-ecoles");
    // Les valeurs sont copiées : modifier la compétition ensuite ne doit rien
    // demander au modèle.
    expect(t.scoring).toEqual(TEMPLATES[0].default_scoring);
    expect(t.scoring).not.toBe(TEMPLATES[0].default_scoring);
  });
});
