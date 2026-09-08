import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  rememberPendingInvite,
  takePendingInvite,
  forgetPendingInvite,
  invitePath,
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
    expect(takePendingInvite()).toEqual({ code: "ABC123", kind: "challenge" });
  });

  it("normalise le code comme le fait la base", () => {
    rememberPendingInvite("  abc123  ");
    expect(takePendingInvite()?.code).toBe("ABC123");
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
    expect(takePendingInvite()?.code).toBe("ABC123");
    expect(takePendingInvite()).toBeNull();
  });

  it("tient encore à cinquante-neuf minutes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-03T10:00:00Z"));
    rememberPendingInvite("ABC123");
    vi.setSystemTime(new Date("2026-09-03T10:59:00Z"));
    expect(takePendingInvite()?.code).toBe("ABC123");
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

  /**
   * Depuis que les groupes s'invitent aussi, le code seul ne suffit plus à
   * savoir où retourner : les deux codes vivent dans des tables différentes,
   * chacune avec sa propre unicité. Retenir l'espèce, c'est la seule garantie
   * de ne pas rouvrir la mauvaise porte au retour de l'inscription.
   */
  it("distingue un groupe d'un défi", () => {
    rememberPendingInvite("GRP456", "group");
    expect(takePendingInvite()).toEqual({ code: "GRP456", kind: "group" });
  });

  it("renvoie chacun vers son écran", () => {
    expect(invitePath({ code: "ABC123", kind: "challenge" })).toBe("/join/ABC123");
    expect(invitePath({ code: "GRP456", kind: "group" })).toBe("/join-group/GRP456");
  });

  /** Les notes écrites avant les groupes ne pouvaient être que des défis. */
  it("relit une note d'avant les groupes comme un défi", () => {
    localStorage.setItem(
      "vocme_pending_invite",
      JSON.stringify({ code: "ABC123", at: Date.now() })
    );
    expect(takePendingInvite()).toEqual({ code: "ABC123", kind: "challenge" });
  });
});
