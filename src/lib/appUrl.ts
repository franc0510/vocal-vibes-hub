/**
 * Où vit l'application, et comment on y renvoie quelqu'un.
 *
 * `window.location.origin` ne convient pas : dans l'application iOS, la
 * webview sert des fichiers locaux et l'origine vaut `capacitor://localhost`.
 * Un lien fabriqué à partir d'elle est mort pour tous ceux qui le reçoivent —
 * c'est exactement ce que fait `SharePanel` aujourd'hui, dont les liens de
 * partage ne mènent nulle part depuis un téléphone.
 *
 * D'où une origine déclarée, unique, et lisible depuis l'environnement pour
 * que changer de domaine ne demande pas de toucher au code.
 */

/**
 * Le domaine public de l'application.
 *
 * La valeur par défaut est celle qui était déjà écrite en dur, deux fois, dans
 * `nativeAuthService.ts` comme cible de redirection OAuth : c'est le seul
 * domaine réel que ce dépôt connaisse.
 */
export const APP_ORIGIN: string = (
  import.meta.env.VITE_APP_URL ?? "https://vocme-tawny.vercel.app"
).replace(/\/+$/, "");

/**
 * Le schème que l'application enregistre auprès d'iOS (`Info.plist`).
 *
 * Il ouvre l'application quand elle est installée. Il ne remplace pas un lien
 * web : la plupart des messageries n'en font pas un lien cliquable, et il ne
 * mène nulle part sans l'application. Les deux se complètent — le lien web se
 * partage, le schème raccourcit le chemin pour qui a déjà l'application.
 */
export const APP_SCHEME = "vocme";

/**
 * La fiche App Store, si elle existe.
 *
 * Laissée vide tant qu'elle n'est pas renseignée : mieux vaut ne pas proposer
 * de bouton que d'en proposer un qui tombe sur une page d'erreur. Renseigner
 * `VITE_APP_STORE_URL` le fait apparaître, sans autre changement.
 */
export const APP_STORE_URL: string | null =
  import.meta.env.VITE_APP_STORE_URL || null;

/** Le lien d'invitation à partager. Celui qui se colle dans une conversation. */
export const inviteUrl = (code: string): string =>
  `${APP_ORIGIN}/join/${encodeURIComponent(code.trim().toUpperCase())}`;

/** Le même, pour ouvrir directement l'application installée. */
export const inviteDeepLink = (code: string): string =>
  `${APP_SCHEME}://join/${encodeURIComponent(code.trim().toUpperCase())}`;
