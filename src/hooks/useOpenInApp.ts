import { useCallback, useEffect, useRef, useState } from "react";
import {
  APP_OPEN_TIMEOUT_MS,
  detectPlatform,
  downloadUrlFor,
} from "@/lib/appStore";

/**
 * « Ouvrir dans l'application », y compris quand on ne l'a pas.
 *
 * Un schème d'URL n'accuse jamais réception. `vocme://join-group/ABC123`
 * ouvre l'application si elle est installée, et ne fait RIEN sinon : ni
 * erreur, ni message, la page ne bouge pas. L'invité restait devant un bouton
 * mort, sans jamais se voir proposer le téléchargement.
 *
 * Le seul indice disponible est indirect : si l'application s'est ouverte,
 * l'onglet passe en arrière-plan. On tente donc le schème, et on regarde. Deux
 * secondes plus tard, si la page est toujours au premier plan, c'est que rien
 * ne s'est ouvert — on part vers la boutique.
 *
 * Le point délicat est l'inverse : NE PAS arracher à son application celui qui
 * l'a bien. D'où l'annulation dès le moindre signe de départ — page cachée,
 * page démontée, fenêtre qui perd le focus. Chacun de ces signaux arrive avant
 * la fin du délai quand l'application s'ouvre vraiment.
 */

interface OpenInApp {
  /** Tente l'application, puis la boutique si rien ne s'est ouvert. */
  open: () => void;
  /** Une boutique existe-t-elle pour cet appareil ? */
  canDownload: boolean;
  /** L'adresse de la boutique, pour un lien qu'on peut aussi afficher. */
  downloadUrl: string | null;
  /** On a essayé, et l'application ne s'est pas ouverte. */
  appMissing: boolean;
}

export const useOpenInApp = (deepLink: string): OpenInApp => {
  const platform = detectPlatform(
    typeof navigator === "undefined" ? "" : navigator.userAgent,
    typeof navigator === "undefined" ? 0 : navigator.maxTouchPoints
  );
  const downloadUrl = downloadUrlFor(platform);

  const [appMissing, setAppMissing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelled = useRef(false);

  const stop = useCallback(() => {
    cancelled.current = true;
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  // Démonter l'écran pendant l'attente doit tout arrêter : sans ça, le renvoi
  // vers la boutique tomberait sur quelqu'un déjà passé à autre chose.
  useEffect(() => stop, [stop]);

  const open = useCallback(() => {
    cancelled.current = false;

    const giveUp = () => {
      // `visibilityState` est le juge de paix : les événements peuvent
      // manquer selon le navigateur, l'état, lui, est toujours lisible.
      if (cancelled.current || document.visibilityState !== "visible") return;
      setAppMissing(true);
      if (downloadUrl) window.location.href = downloadUrl;
    };

    const onLeave = () => stop();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") stop();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onLeave);
    window.addEventListener("blur", onLeave);

    timer.current = setTimeout(() => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onLeave);
      window.removeEventListener("blur", onLeave);
      giveUp();
    }, APP_OPEN_TIMEOUT_MS);

    window.location.href = deepLink;
  }, [deepLink, downloadUrl, stop]);

  return { open, canDownload: Boolean(downloadUrl), downloadUrl, appMissing };
};
