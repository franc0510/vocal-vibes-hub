/**
 * Où envoyer quelqu'un qui n'a pas l'application.
 *
 * LE DÉFAUT QUE CE FICHIER RÈGLE.
 *
 * L'écran d'invitation propose « Open in the VocMe app ». Le schème
 * `vocme://` ouvre l'application quand elle est installée — et ne fait
 * absolument RIEN quand elle ne l'est pas : pas d'erreur, pas de message, la
 * page ne bouge simplement pas. On restait planté sur un bouton mort.
 *
 * Le repli existant n'en était pas un : il n'apparaissait qu'APRÈS avoir tapé,
 * il fallait le lire, et il ne donnait un lien que si `VITE_APP_STORE_URL`
 * était renseignée — ce qu'elle n'a jamais été. En pratique, l'invité lisait
 * « You can keep going right here in your browser » et n'avait jamais accès au
 * téléchargement.
 *
 * On garde la règle que le dépôt s'était donnée : mieux vaut pas de bouton
 * qu'un bouton vers une page d'erreur. D'où une destination qui vaut `null`
 * tant qu'elle n'est pas connue, et jamais une URL devinée.
 */

/** Les plateformes qui ont une boutique où l'on puisse envoyer quelqu'un. */
export type StorePlatform = "ios" | "android" | "other";

/**
 * Reconnaît la plateforme, iPad compris.
 *
 * Un iPad sous iPadOS 13+ s'annonce comme un Macintosh : sans le nombre de
 * points de contact, il passerait pour un ordinateur de bureau et n'aurait
 * jamais l'App Store — alors que c'est l'appareil sur lequel on ouvre une
 * invitation reçue par message.
 */
export const detectPlatform = (
  userAgent: string,
  maxTouchPoints = 0
): StorePlatform => {
  const ua = userAgent || "";
  if (/android/i.test(ua)) return "android";
  if (/iPad|iPhone|iPod/i.test(ua)) return "ios";
  if (/Macintosh/i.test(ua) && maxTouchPoints > 1) return "ios";
  return "other";
};

/**
 * La fiche App Store, telle qu'on la configure.
 *
 * Accepte les deux formes qu'on a sous la main au moment de la renseigner :
 * l'URL complète copiée depuis l'App Store, ou le seul identifiant numérique.
 * Se tromper de forme est l'erreur la plus facile à commettre ici, et elle ne
 * se verrait qu'au moment où un invité tape sur le lien.
 */
export const normalizeAppStoreUrl = (value: string | null | undefined): string | null => {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  // « 6478123456 » ou « id6478123456 » : on complète.
  const bare = raw.replace(/^id/i, "");
  if (/^\d{6,}$/.test(bare)) return `https://apps.apple.com/app/id${bare}`;
  if (/^https?:\/\//i.test(raw)) return raw;
  // Ni une URL ni un identifiant : on n'envoie personne vers une adresse
  // inventée.
  return null;
};

export const APP_STORE_URL: string | null = normalizeAppStoreUrl(
  import.meta.env.VITE_APP_STORE_URL
);

/**
 * Le Play Store n'est pas deviné depuis l'identifiant de paquet.
 *
 * L'URL se fabriquerait pourtant sans peine — `?id=com.vocme.app` — mais elle
 * mènerait à une page d'erreur tant que l'application n'y est pas publiée.
 * Le jour où elle l'est, cette variable suffit.
 */
export const PLAY_STORE_URL: string | null =
  (import.meta.env.VITE_PLAY_STORE_URL || "").trim() || null;

/**
 * Où télécharger, pour cet appareil-ci. `null` si l'on ne sait pas.
 *
 * Un iPhone n'a rien à faire du Play Store, et réciproquement : proposer la
 * mauvaise boutique est une manière plus polie de ne rien proposer du tout.
 */
export const downloadUrlFor = (
  platform: StorePlatform,
  stores: { ios?: string | null; android?: string | null } = {
    ios: APP_STORE_URL,
    android: PLAY_STORE_URL,
  }
): string | null => {
  if (platform === "ios") return stores.ios ?? null;
  if (platform === "android") return stores.android ?? null;
  // Sur un ordinateur, l'application ne sert à rien : le navigateur fait
  // l'affaire, et c'est ce que l'écran dit déjà.
  return null;
};

/**
 * Combien de temps attendre avant de conclure que l'application est absente.
 *
 * Le schème n'accuse jamais réception. Le seul indice disponible est que la
 * page soit toujours là un instant plus tard : si l'application s'était
 * ouverte, l'onglet serait passé en arrière-plan.
 *
 * Assez long pour laisser iOS afficher sa demande de confirmation et
 * l'utilisateur y répondre — plus court, on enverrait vers la boutique
 * quelqu'un qui a l'application et s'apprêtait à l'ouvrir.
 */
export const APP_OPEN_TIMEOUT_MS = 2000;
