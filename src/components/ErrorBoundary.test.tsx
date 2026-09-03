import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import ErrorBoundary from "./ErrorBoundary";

/**
 * La barrière existe pour une raison précise : un écran blanc ne dit rien.
 * Ces tests vérifient qu'elle attrape, qu'elle parle, et qu'elle ne gêne pas
 * les écrans qui vont bien.
 */

const Boom = () => {
  throw new Error("rendu impossible");
};

describe("ErrorBoundary", () => {
  afterEach(() => vi.restoreAllMocks());

  it("laisse passer un écran qui va bien", () => {
    render(<ErrorBoundary><p>tout va bien</p></ErrorBoundary>);
    expect(screen.getByText("tout va bien")).toBeTruthy();
  });

  it("dit qu'il y a un problème au lieu de ne rien afficher", () => {
    // React journalise l'erreur attrapée ; on tait le bruit du test.
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { container } = render(<ErrorBoundary><Boom /></ErrorBoundary>);
    expect(screen.getByText("This screen ran into a problem")).toBeTruthy();
    // Le point de départ du bug : l'écran n'était pas seulement cassé, il était
    // VIDE. Il doit désormais rester quelque chose à lire.
    expect(container.textContent?.trim().length).toBeGreaterThan(0);
  });

  it("offre un chemin pour repartir", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<ErrorBoundary><Boom /></ErrorBoundary>);
    expect(screen.getByText(/Reload VocMe/)).toBeTruthy();
  });
});
