import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

/**
 * Ce que cet écran doit garantir, et que rien d'autre ne garantissait.
 *
 * Toutes les autres routes vivent sous `ProtectedRoute`, qui renvoie vers
 * `/auth` avec `replace` — donc en effaçant l'URL visée jusque dans
 * l'historique. Une invitation qui passe par là est perdue : l'invité arrive
 * sur le fil d'actualité et doit redemander le code à celui qui l'a invité.
 *
 * Un lien d'invitation n'a d'intérêt que s'il fonctionne pour quelqu'un qui
 * n'a PAS encore de compte. C'est précisément ce qui est vérifié ici.
 */

const invite = {
  id: "comp-1",
  name: "Défi inter-écoles",
  description: null,
  prize: "Une soirée bière/pizza",
  visibility: "private" as const,
  starts_on: "2026-09-03",
  ends_on: "2026-09-09",
  timezone: "Europe/Paris",
  closed_at: null,
  day_count: 7,
  member_count: 12,
  teams: [
    { id: "t1", name: "ENSA", color: "#e11d48" },
    { id: "t2", name: "UTC", color: "#2563eb" },
  ],
  is_member: false,
  is_open: true,
};

const rpc = vi.fn();
let currentUser: { id: string } | null = null;

vi.mock("@/integrations/supabase/untyped", () => ({
  db: { rpc: (...args: unknown[]) => rpc(...args) },
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: currentUser, loading: false }),
}));
vi.mock("@/hooks/useCompetitions", () => ({
  useCompetitions: () => ({ join: vi.fn() }),
}));

import JoinChallengePage from "./JoinChallengePage";

const renderAt = (code: string) =>
  render(
    <MemoryRouter initialEntries={[`/join/${code}`]}>
      <Routes>
        <Route path="/join/:code" element={<JoinChallengePage />} />
        <Route path="/auth" element={<p>ÉCRAN DE CONNEXION</p>} />
      </Routes>
    </MemoryRouter>
  );

describe("JoinChallengePage", () => {
  beforeEach(() => {
    rpc.mockReset();
    currentUser = null;
    localStorage.clear();
  });

  it("montre l'invitation à quelqu'un qui n'a pas de compte", async () => {
    rpc.mockResolvedValue({ data: invite, error: null });
    renderAt("ABC123");

    // Le point entier de la fonctionnalité : on voit à quoi on est invité
    // AVANT de s'inscrire, au lieu d'être renvoyé vers la connexion.
    await waitFor(() => expect(screen.getByText("Défi inter-écoles")).toBeTruthy());
    expect(screen.queryByText("ÉCRAN DE CONNEXION")).toBeNull();
  });

  it("annonce le lot, la durée et le nombre de joueurs", async () => {
    rpc.mockResolvedValue({ data: invite, error: null });
    renderAt("ABC123");
    await waitFor(() => expect(screen.getByText("Une soirée bière/pizza")).toBeTruthy());
    expect(screen.getByText(/7 days/)).toBeTruthy();
    expect(screen.getByText(/12 players/)).toBeTruthy();
  });

  /**
   * Le camp se choisit en entrant, et c'est définitif. Le montrer sur
   * l'invitation évite de s'engager sans savoir entre quoi et quoi.
   */
  it("propose les équipes avant d'entrer", async () => {
    rpc.mockResolvedValue({ data: invite, error: null });
    renderAt("ABC123");
    await waitFor(() => expect(screen.getByText("ENSA")).toBeTruthy());
    expect(screen.getByText("UTC")).toBeTruthy();
  });

  it("propose de s'inscrire quand on n'est pas connecté", async () => {
    rpc.mockResolvedValue({ data: invite, error: null });
    renderAt("ABC123");
    await waitFor(() => expect(screen.getByText(/Sign in and join/)).toBeTruthy());
  });

  it("propose de rejoindre quand on l'est", async () => {
    currentUser = { id: "u1" };
    rpc.mockResolvedValue({ data: invite, error: null });
    renderAt("ABC123");
    await waitFor(() => expect(screen.getByText(/Join the challenge/)).toBeTruthy());
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

  it("n'invite pas à rejoindre un défi terminé", async () => {
    rpc.mockResolvedValue({ data: { ...invite, is_open: false }, error: null });
    renderAt("ABC123");
    await waitFor(() =>
      expect(screen.getByText(/This challenge is over/)).toBeTruthy()
    );
    expect(screen.queryByText(/Sign in and join/)).toBeNull();
  });
});
