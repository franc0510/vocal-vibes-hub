/**
 * L'invitation qu'on garde pendant que l'invité s'inscrit.
 *
 * Sans elle, une invitation ne survivait pas à l'écran de connexion :
 * `ProtectedRoute` renvoie vers `/auth` avec `replace`, ce qui efface l'URL
 * visée jusque dans l'historique, et la connexion renvoie ensuite au fil
 * d'actualité. Quelqu'un qui recevait un lien devait donc s'inscrire, puis
 * réclamer le code à celui qui l'avait invité.
 *
 * `localStorage` et non `sessionStorage` : l'authentification native quitte
 * l'application pour Safari, revient par un lien profond, et `App.tsx` finit
 * par un `window.location.href = "/"` qui recharge tout. Rien en mémoire ne
 * survit à ce trajet ; `sessionStorage` non plus, selon le contexte rendu.
 *
 * La note est datée et périmée au bout d'une heure : une invitation retrouvée
 * trois jours plus tard, au hasard d'une connexion, détournerait quelqu'un vers
 * un défi qu'il n'a jamais demandé à rejoindre.
 */

const KEY = "vocme_pending_invite";
const MAX_AGE_MS = 60 * 60 * 1000;

/**
 * À quoi on est invité.
 *
 * Le code seul ne suffit plus depuis que les groupes s'invitent aussi : les
 * deux codes vivent dans des tables différentes, chacune avec sa propre
 * unicité, et rien ne garantit qu'un code de groupe ne soit pas également un
 * code de défi. Retenir le code sans son espèce, c'est risquer de rouvrir la
 * mauvaise porte au retour de l'inscription.
 */
export type InviteKind = "challenge" | "group";

export interface PendingInvite {
  code: string;
  kind: InviteKind;
}

interface Stored extends PendingInvite {
  at: number;
}

/** L'écran vers lequel une invitation retenue doit renvoyer. */
export const invitePath = ({ code, kind }: PendingInvite): string =>
  kind === "group" ? `/join-group/${code}` : `/join/${code}`;

/** Retient l'invitation, le temps de passer par l'inscription. */
export const rememberPendingInvite = (code: string, kind: InviteKind = "challenge"): void => {
  const clean = code.trim().toUpperCase();
  if (!clean) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ code: clean, kind, at: Date.now() } satisfies Stored));
  } catch {
    // Navigation privée, stockage plein : on perd le raccourci, pas l'app.
  }
};

/**
 * Reprend l'invitation retenue, et l'oublie aussitôt.
 *
 * La lecture consomme : sans ça, chaque connexion ultérieure renverrait vers
 * la même invitation, longtemps après qu'elle a été honorée.
 */
export const takePendingInvite = (): PendingInvite | null => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    localStorage.removeItem(KEY);
    const stored = JSON.parse(raw) as Stored;
    if (!stored?.code || typeof stored.at !== "number") return null;
    if (Date.now() - stored.at > MAX_AGE_MS) return null;
    // Les notes écrites avant les groupes n'ont pas d'espèce : elles ne
    // pouvaient être que des défis.
    return { code: stored.code, kind: stored.kind === "group" ? "group" : "challenge" };
  } catch {
    return null;
  }
};

/** Oublie l'invitation sans la suivre — quand l'invité fait autre chose. */
export const forgetPendingInvite = (): void => {
  try { localStorage.removeItem(KEY); } catch { /* rien à faire */ }
};
