import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Une anecdote de compétition part dans le feed normal, comme toutes les autres.
 *
 * C'est l'inverse d'un post de groupe, que `RealsViewer` masque du feed « Pour
 * toi ». La tentation de réutiliser ce mécanisme est réelle et serait une
 * faute : le défi n'a d'intérêt que si les anecdotes sont vues par tout le
 * monde, y compris par ceux qui n'y participent pas.
 *
 * Ce test lit le code plutôt que de le faire tourner, parce que la règle porte
 * sur ce qu'on n'écrit pas. Un `.eq("competition_day_id", …)` ajouté par
 * mégarde dans six mois ne casserait aucun test de rendu — il rendrait juste
 * le défi invisible, et personne ne saurait pourquoi les inscriptions stagnent.
 */

const ROOT = join(__dirname, "..");
const FEED_FILES = [
  "components/RealsViewer.tsx",
  "hooks/useVoicePosts.ts",
  "pages/FeedPage.tsx",
  "lib/feedOrder.ts",
];

describe("le feed ignore les compétitions", () => {
  for (const file of FEED_FILES) {
    it(`${file} ne filtre pas sur competition_day_id`, () => {
      const source = readFileSync(join(ROOT, file), "utf8");
      // Les commentaires ont le droit de la nommer — c'est même souhaitable.
      const code = source
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .split("\n")
        .filter((line) => !line.trim().startsWith("//"))
        .join("\n");
      expect(code).not.toContain("competition_day_id");
    });
  }

  it("la colonne existe bien ailleurs, sinon ce test ne prouverait rien", () => {
    // Sans ça, renommer la colonne rendrait les assertions ci-dessus vraies
    // pour la mauvaise raison, et la protection disparaîtrait en silence.
    const record = readFileSync(join(ROOT, "pages/RecordPage.tsx"), "utf8");
    expect(record).toContain("competition_day_id");
  });
});
