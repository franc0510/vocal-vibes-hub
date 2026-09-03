import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  rememberPendingInvite,
  takePendingInvite,
  forgetPendingInvite,
} from "./pendingInvite";

/**
 * L'invitation doit survivre à l'inscription, et à rien d'autre.
 *
 * Elle traverse un écran de connexion, parfois un aller-retour par Safari et un
 * rechargement complet de la page. Mais elle ne doit pas ressurgir trois jours
 * plus tard pour détourner quelqu'un vers un défi qu'il n'a jamais demandé.
 */

describe("pendingInvite", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.useRealTimers());

  it("rend le code retenu", () => {
    rememberPendingInvite("ABC123");
    expect(takePendingInvite()).toBe("ABC123");
  });

  it("normalise le code comme le fait la base", () => {
    rememberPendingInvite("  abc123  ");
    expect(takePendingInvite()).toBe("ABC123");
  });

  it("ne retient rien d'un code vide", () => {
    rememberPendingInvite("   ");
    expect(takePendingInvite()).toBeNull();
  });

  /**
   * La lecture consomme. Sans ça, chaque connexion ultérieure renverrait vers
   * la même invitation, longtemps après qu'elle a été honorée.
   */
  it("s'oublie dès qu'on l'a reprise", () => {
    rememberPendingInvite("ABC123");
    expect(takePendingInvite()).toBe("ABC123");
    expect(takePendingInvite()).toBeNull();
  });

  it("tient encore à cinquante-neuf minutes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-03T10:00:00Z"));
    rememberPendingInvite("ABC123");
    vi.setSystemTime(new Date("2026-09-03T10:59:00Z"));
    expect(takePendingInvite()).toBe("ABC123");
  });

  it("a péri à une heure et une minute", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-03T10:00:00Z"));
    rememberPendingInvite("ABC123");
    vi.setSystemTime(new Date("2026-09-03T11:01:00Z"));
    expect(takePendingInvite()).toBeNull();
  });

  it("s'oublie sur demande", () => {
    rememberPendingInvite("ABC123");
    forgetPendingInvite();
    expect(takePendingInvite()).toBeNull();
  });

  it("survit à du contenu illisible sans faire tomber l'écran", () => {
    localStorage.setItem("vocme_pending_invite", "{ pas du json");
    expect(takePendingInvite()).toBeNull();
  });

  it("ignore une note sans code", () => {
    localStorage.setItem("vocme_pending_invite", JSON.stringify({ at: Date.now() }));
    expect(takePendingInvite()).toBeNull();
  });
});
