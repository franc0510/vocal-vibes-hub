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

interface Stored {
  code: string;
  at: number;
}

/** Retient le code, le temps de passer par l'inscription. */
export const rememberPendingInvite = (code: string): void => {
  const clean = code.trim().toUpperCase();
  if (!clean) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ code: clean, at: Date.now() } satisfies Stored));
  } catch {
    // Navigation privée, stockage plein : on perd le raccourci, pas l'app.
  }
};

/**
 * Reprend le code retenu, et l'oublie aussitôt.
 *
 * La lecture consomme : sans ça, chaque connexion ultérieure renverrait vers
 * la même invitation, longtemps après qu'elle a été honorée.
 */
export const takePendingInvite = (): string | null => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    localStorage.removeItem(KEY);
    const stored = JSON.parse(raw) as Stored;
    if (!stored?.code || typeof stored.at !== "number") return null;
    if (Date.now() - stored.at > MAX_AGE_MS) return null;
    return stored.code;
  } catch {
    return null;
  }
};

/** Oublie l'invitation sans la suivre — quand l'invité fait autre chose. */
export const forgetPendingInvite = (): void => {
  try { localStorage.removeItem(KEY); } catch { /* rien à faire */ }
};
