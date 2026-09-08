import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

/**
 * Ce que cet écran doit garantir, et que rien d'autre ne garantissait.
 *
 * Un groupe ne se rejoignait pas : il fallait que son propriétaire vous y
 * mette, et seulement s'il vous suivait déjà. Le lien d'invitation existe pour
 * ouvrir cette porte — donc il doit fonctionner pour quelqu'un qui n'a PAS
 * encore de compte, sans quoi il ne sert qu'à ceux qui sont déjà là.
 *
 * Toutes les autres routes vivent sous `ProtectedRoute`, qui renvoie vers
 * `/auth` avec `replace` — en effaçant l'URL visée jusque dans l'historique.
 * C'est précisément ce que cet écran contourne.
 */

const invite = {
  id: "group-1",
  name: "Les colocs",
  created_at: "2026-09-01T10:00:00Z",
  member_count: 4,
  owner_name: "Camille",
  owner_username: "camille",
  owner_avatar_url: null,
  is_member: false,
};

const rpc = vi.fn();
const joinWithCode = vi.fn();
let currentUser: { id: string } | null = null;

vi.mock("@/integrations/supabase/untyped", () => ({
  db: { rpc: (...args: unknown[]) => rpc(...args) },
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: currentUser, loading: false }),
}));
vi.mock("@/hooks/useGroups", () => ({
  useGroups: () => ({ joinWithCode }),
}));

import JoinGroupPage from "./JoinGroupPage";

const renderAt = (code: string) =>
  render(
    <MemoryRouter initialEntries={[`/join-group/${code}`]}>
      <Routes>
        <Route path="/join-group/:code" element={<JoinGroupPage />} />
        <Route path="/auth" element={<p>ÉCRAN DE CONNEXION</p>} />
        <Route path="/groups" element={<p>MES GROUPES</p>} />
      </Routes>
    </MemoryRouter>
  );

describe("JoinGroupPage", () => {
  beforeEach(() => {
    rpc.mockReset();
    joinWithCode.mockReset();
    currentUser = null;
    localStorage.clear();
  });

  it("montre l'invitation à quelqu'un qui n'a pas de compte", async () => {
    rpc.mockResolvedValue({ data: invite, error: null });
    renderAt("ABC123");

    // Le point entier de la fonctionnalité : on voit à quoi on est invité
    // AVANT de s'inscrire, au lieu d'être renvoyé vers la connexion.
    await waitFor(() => expect(screen.getByText("Les colocs")).toBeTruthy());
    expect(screen.queryByText("ÉCRAN DE CONNEXION")).toBeNull();
  });

  /** Un nom rassure là où un lien seul inquiète. */
  it("dit qui invite, et combien ils sont", async () => {
    rpc.mockResolvedValue({ data: invite, error: null });
    renderAt("ABC123");
    await waitFor(() => expect(screen.getByText(/Camille invites you/)).toBeTruthy());
    expect(screen.getByText(/4 members/)).toBeTruthy();
  });

  it("propose de s'inscrire quand on n'est pas connecté", async () => {
    rpc.mockResolvedValue({ data: invite, error: null });
    renderAt("ABC123");
    await waitFor(() => expect(screen.getByText(/Sign in and join/)).toBeTruthy());
  });

  /**
   * Le code doit survivre à l'inscription, ET se souvenir qu'il désigne un
   * GROUPE : les deux familles de codes vivent dans des tables différentes, et
   * une note sans espèce rouvrirait l'écran des défis.
   */
  it("retient l'invitation comme celle d'un groupe avant d'envoyer s'inscrire", async () => {
    rpc.mockResolvedValue({ data: invite, error: null });
    renderAt("ABC123");
    await waitFor(() => expect(screen.getByText(/Sign in and join/)).toBeTruthy());

    fireEvent.click(screen.getByText(/Sign in and join/));

    await waitFor(() => expect(screen.getByText("ÉCRAN DE CONNEXION")).toBeTruthy());
    expect(JSON.parse(localStorage.getItem("vocme_pending_invite") ?? "{}")).toMatchObject({
      code: "ABC123",
      kind: "group",
    });
  });

  it("fait entrer celui qui est connecté", async () => {
    currentUser = { id: "u1" };
    rpc.mockResolvedValue({ data: invite, error: null });
    joinWithCode.mockResolvedValue({ id: "group-1", name: "Les colocs" });
    renderAt("ABC123");

    await waitFor(() => expect(screen.getByText(/Join the group/)).toBeTruthy());
    fireEvent.click(screen.getByText(/Join the group/));

    await waitFor(() => expect(joinWithCode).toHaveBeenCalledWith("ABC123"));
    await waitFor(() => expect(screen.getByText("MES GROUPES")).toBeTruthy());
  });

  /** Recliquer sur le lien qu'on a déjà accepté ouvre, ça ne redemande rien. */
  it("ouvre directement quand on est déjà membre", async () => {
    currentUser = { id: "u1" };
    rpc.mockResolvedValue({ data: { ...invite, is_member: true }, error: null });
    renderAt("ABC123");
    await waitFor(() => expect(screen.getByText("MES GROUPES")).toBeTruthy());
  });

  it("le dit clairement quand le code ne mène à rien", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    renderAt("ZZZZZZ");
    await waitFor(() =>
      expect(screen.getByText("This invite link is not valid")).toBeTruthy()
    );
  });

  /**
   * Un réseau coupé et un code inconnu ne se disent pas pareil : l'un invite à
   * réessayer, l'autre non.
   */
  it("distingue une panne réseau d'un code inconnu", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "network" } });
    renderAt("ABC123");
    await waitFor(() =>
      expect(screen.getByText("Could not load this invite")).toBeTruthy()
    );
    expect(screen.getByText("Try again")).toBeTruthy();
  });
});
