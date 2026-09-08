import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

/**
 * Le bouton « Open in the VocMe app », et ses deux façons de mal tourner.
 *
 * Un schème d'URL n'accuse jamais réception : `vocme://…` ouvre l'application
 * si elle est là, et ne fait RIEN sinon. D'où deux erreurs symétriques, aussi
 * fâcheuses l'une que l'autre :
 *
 *   — ne rien proposer à qui n'a pas l'application (le défaut rapporté : le
 *     bouton restait mort, sans lien de téléchargement) ;
 *   — arracher à son application celui qui l'a bien, en l'envoyant sur la
 *     boutique alors qu'elle était en train de s'ouvrir.
 *
 * Ces tests tiennent les deux bouts.
 */

let storeUrl: string | null = "https://apps.apple.com/app/id123";

vi.mock("@/lib/appStore", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/appStore")>();
  return { ...actual, downloadUrlFor: () => storeUrl };
});

import { useOpenInApp } from "./useOpenInApp";
import { APP_OPEN_TIMEOUT_MS } from "@/lib/appStore";

const DEEP_LINK = "vocme://join-group/ABC123";

/** jsdom refuse une vraie navigation : on observe l'intention. */
const stubLocation = () => {
  const location = { href: "" } as { href: string };
  Object.defineProperty(window, "location", { value: location, writable: true });
  return location;
};

const setVisibility = (state: "visible" | "hidden") =>
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });

describe("useOpenInApp", () => {
  let location: { href: string };

  beforeEach(() => {
    vi.useFakeTimers();
    storeUrl = "https://apps.apple.com/app/id123";
    location = stubLocation();
    setVisibility("visible");
  });

  afterEach(() => vi.useRealTimers());

  it("tente d'abord l'application", () => {
    const { result } = renderHook(() => useOpenInApp(DEEP_LINK));
    act(() => result.current.open());
    expect(location.href).toBe(DEEP_LINK);
  });

  /** LE DÉFAUT RAPPORTÉ : sans l'application, on partait dans le vide. */
  it("emmène sur la boutique quand rien ne s'est ouvert", () => {
    const { result } = renderHook(() => useOpenInApp(DEEP_LINK));
    act(() => result.current.open());
    act(() => { vi.advanceTimersByTime(APP_OPEN_TIMEOUT_MS); });

    expect(location.href).toBe("https://apps.apple.com/app/id123");
    expect(result.current.appMissing).toBe(true);
  });

  it("ne bascule pas avant d'avoir laissé sa chance à l'application", () => {
    const { result } = renderHook(() => useOpenInApp(DEEP_LINK));
    act(() => result.current.open());
    act(() => { vi.advanceTimersByTime(APP_OPEN_TIMEOUT_MS - 100); });
    expect(location.href).toBe(DEEP_LINK);
  });

  /**
   * L'ERREUR SYMÉTRIQUE. Si l'application s'ouvre, l'onglet passe en
   * arrière-plan : c'est le seul indice qu'on ait, et il doit tout annuler.
   * Sans ça, on ramènerait sur l'App Store quelqu'un qui a déjà l'application
   * ouverte sous les yeux.
   */
  it("renonce si l'application s'est ouverte", () => {
    const { result } = renderHook(() => useOpenInApp(DEEP_LINK));
    act(() => result.current.open());

    act(() => {
      setVisibility("hidden");
      document.dispatchEvent(new Event("visibilitychange"));
      vi.advanceTimersByTime(APP_OPEN_TIMEOUT_MS);
    });

    expect(location.href).toBe(DEEP_LINK);
    expect(result.current.appMissing).toBe(false);
  });

  it("renonce aussi quand la fenêtre perd le focus", () => {
    const { result } = renderHook(() => useOpenInApp(DEEP_LINK));
    act(() => result.current.open());

    act(() => {
      window.dispatchEvent(new Event("blur"));
      vi.advanceTimersByTime(APP_OPEN_TIMEOUT_MS);
    });

    expect(location.href).toBe(DEEP_LINK);
  });

  /**
   * `visibilityState` est le juge de paix : les événements peuvent manquer
   * selon le navigateur, l'état est toujours lisible.
   */
  it("renonce sur le seul état de la page, sans événement", () => {
    const { result } = renderHook(() => useOpenInApp(DEEP_LINK));
    act(() => result.current.open());

    act(() => {
      setVisibility("hidden");
      vi.advanceTimersByTime(APP_OPEN_TIMEOUT_MS);
    });

    expect(location.href).toBe(DEEP_LINK);
  });

  /** Quitter l'écran pendant l'attente ne doit pas déclencher un renvoi. */
  it("s'arrête si l'écran est démonté entre-temps", () => {
    const { result, unmount } = renderHook(() => useOpenInApp(DEEP_LINK));
    act(() => result.current.open());
    unmount();
    act(() => { vi.advanceTimersByTime(APP_OPEN_TIMEOUT_MS); });

    expect(location.href).toBe(DEEP_LINK);
  });

  /**
   * Sans boutique connue — un ordinateur, ou une plateforme où VocMe n'est
   * pas publiée — on ne renvoie nulle part, mais on le DIT : c'est ce qui
   * remplace le bouton muet.
   */
  it("sans boutique, ne renvoie nulle part mais l'annonce", () => {
    storeUrl = null;
    const { result } = renderHook(() => useOpenInApp(DEEP_LINK));
    act(() => result.current.open());
    act(() => { vi.advanceTimersByTime(APP_OPEN_TIMEOUT_MS); });

    expect(location.href).toBe(DEEP_LINK);
    expect(result.current.appMissing).toBe(true);
    expect(result.current.canDownload).toBe(false);
  });

  it("expose l'adresse de la boutique pour l'afficher aussi en lien", () => {
    const { result } = renderHook(() => useOpenInApp(DEEP_LINK));
    expect(result.current.downloadUrl).toBe("https://apps.apple.com/app/id123");
    expect(result.current.canDownload).toBe(true);
  });
});
