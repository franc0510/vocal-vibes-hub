import { describe, it, expect } from "vitest";
import { detectPlatform, downloadUrlFor, normalizeAppStoreUrl } from "./appStore";

/**
 * « S'il n'a pas l'application, ça ne donne pas direct le lien de
 * téléchargement. »
 *
 * Le schème `vocme://` ne fait rien quand l'application est absente : pas
 * d'erreur, pas de message, la page ne bouge pas. Encore faut-il savoir OÙ
 * envoyer les gens — et ne pas leur proposer la mauvaise boutique, ni une
 * adresse inventée.
 */

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const IPAD_OS =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36";
const MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

describe("reconnaître l'appareil", () => {
  it("un iPhone", () => expect(detectPlatform(IPHONE)).toBe("ios"));
  it("un Android", () => expect(detectPlatform(ANDROID)).toBe("android"));
  it("un ordinateur", () => expect(detectPlatform(MAC)).toBe("other"));

  /**
   * Le piège d'iPadOS : depuis la version 13, un iPad s'annonce comme un
   * Macintosh. Sans le nombre de points de contact il passerait pour un
   * ordinateur — et n'aurait jamais l'App Store, alors que c'est justement un
   * appareil sur lequel on ouvre une invitation reçue par message.
   */
  it("un iPad, qui se fait passer pour un Mac", () => {
    expect(detectPlatform(IPAD_OS, 5)).toBe("ios");
    expect(detectPlatform(IPAD_OS, 0)).toBe("other");
  });

  it("ne tombe pas sur un agent vide", () => {
    expect(detectPlatform("")).toBe("other");
  });
});

describe("la fiche App Store, quelle que soit la forme collée", () => {
  it("accepte l'URL complète", () => {
    expect(normalizeAppStoreUrl("https://apps.apple.com/fr/app/vocme/id6478123456")).toBe(
      "https://apps.apple.com/fr/app/vocme/id6478123456"
    );
  });

  /** Coller le seul identifiant est l'erreur la plus facile à commettre. */
  it("complète un identifiant numérique", () => {
    expect(normalizeAppStoreUrl("6478123456")).toBe("https://apps.apple.com/app/id6478123456");
    expect(normalizeAppStoreUrl("id6478123456")).toBe("https://apps.apple.com/app/id6478123456");
  });

  it("ignore les espaces autour", () => {
    expect(normalizeAppStoreUrl("  6478123456 ")).toBe("https://apps.apple.com/app/id6478123456");
  });

  /**
   * Mieux vaut pas de bouton qu'un bouton vers une page d'erreur : c'est la
   * règle que le dépôt s'était donnée, on la tient.
   */
  it("rend null plutôt que d'inventer une adresse", () => {
    expect(normalizeAppStoreUrl("")).toBeNull();
    expect(normalizeAppStoreUrl("   ")).toBeNull();
    expect(normalizeAppStoreUrl(null)).toBeNull();
    expect(normalizeAppStoreUrl(undefined)).toBeNull();
    expect(normalizeAppStoreUrl("VocMe")).toBeNull();
    expect(normalizeAppStoreUrl("42")).toBeNull();
  });
});

describe("à chaque appareil sa boutique", () => {
  const stores = { ios: "https://apps.apple.com/app/id1", android: "https://play.google.com/x" };

  it("l'iPhone va sur l'App Store", () => {
    expect(downloadUrlFor("ios", stores)).toBe(stores.ios);
  });

  it("l'Android va sur le Play Store", () => {
    expect(downloadUrlFor("android", stores)).toBe(stores.android);
  });

  /** Sur un ordinateur, le navigateur fait l'affaire — l'écran le dit déjà. */
  it("l'ordinateur ne va nulle part", () => {
    expect(downloadUrlFor("other", stores)).toBeNull();
  });

  /**
   * VocMe n'est pas sur le Play Store. L'URL se fabriquerait pourtant sans
   * peine depuis `com.vocme.app` — et mènerait à une page d'erreur.
   */
  it("pas de boutique configurée, pas de lien", () => {
    expect(downloadUrlFor("android", { ios: stores.ios, android: null })).toBeNull();
    expect(downloadUrlFor("ios", { ios: null, android: stores.android })).toBeNull();
  });

  it("ne propose jamais la boutique de l'autre plateforme", () => {
    expect(downloadUrlFor("android", { ios: stores.ios, android: null })).not.toBe(stores.ios);
  });
});
