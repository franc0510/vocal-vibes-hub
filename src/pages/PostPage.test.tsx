import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

/**
 * Une anecdote fraîchement publiée ouvre une page blanche.
 *
 * `parseSegments` rend `null` quand une anecdote n'a pas encore de segments
 * horodatés — ce qui est le cas de TOUTE anecdote tant que sa transcription
 * tourne en tâche de fond, donc de toutes celles qu'on vient d'enregistrer.
 * `segments.length` sur `null` lève, React démonte l'arbre entier, et comme
 * l'application n'a aucune barrière d'erreur, il ne reste rien à l'écran.
 *
 * C'est le chemin le plus courant d'un défi : on enregistre, on tape sur son
 * anecdote dans l'urne, et l'écran devient blanc.
 */

const post = {
  id: "p1",
  user_id: "u1",
  title: "Mon pire date",
  audio_url: "http://audio",
  duration: 42,
  duration_ms: 42000,
  created_at: new Date().toISOString(),
  likes_count: 0,
  comments_count: 0,
  image_url: null,
  location: null,
  transcription: null,
  video_url: null,
  illustration_status: "none",
};

let segmentsValue: unknown = null;

const single = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => single(),
          maybeSingle: () => Promise.resolve({ data: null }),
          eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }),
        }),
      }),
    }),
  },
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/hooks/useIllustrations", () => ({
  useIllustrations: () => ({ panels: [], status: "none", requesting: false, illustrate: vi.fn() }),
}));
vi.mock("@/lib/audioManager", () => ({ playExclusive: vi.fn(), releaseAudio: vi.fn() }));
vi.mock("@/components/CommentsPanel", () => ({ default: () => null }));
vi.mock("@/components/SharePanel", () => ({ default: () => null }));
vi.mock("@/components/LikesListModal", () => ({ default: () => null }));
vi.mock("@/components/StorySlideshow", () => ({ default: () => null }));

import PostPage from "./PostPage";

const renderPost = () =>
  render(
    <MemoryRouter initialEntries={["/post/p1"]}>
      <Routes>
        <Route path="/post/:postId" element={<PostPage />} />
      </Routes>
    </MemoryRouter>
  );

describe("PostPage", () => {
  beforeEach(() => {
    single.mockReset();
    single.mockImplementation(() =>
      Promise.resolve({ data: { ...post, transcription_segments: segmentsValue } })
    );
  });

  it("s'affiche pour une anecdote SANS segments — le cas d'une anecdote toute neuve", async () => {
    segmentsValue = null;
    renderPost();
    await waitFor(() => expect(screen.getByText("Mon pire date")).toBeTruthy());
  });

  it("s'affiche aussi quand les segments sont une liste vide", async () => {
    // `parseSegments` rend `null` là aussi : une liste vide n'est pas une
    // liste, de son point de vue.
    segmentsValue = [];
    renderPost();
    await waitFor(() => expect(screen.getByText("Mon pire date")).toBeTruthy());
  });

  it("s'affiche quand les segments sont illisibles", async () => {
    segmentsValue = "pas un tableau";
    renderPost();
    await waitFor(() => expect(screen.getByText("Mon pire date")).toBeTruthy());
  });

  it("s'affiche normalement avec de vrais segments", async () => {
    segmentsValue = [{ start_ms: 0, end_ms: 1000, text: "bonjour" }];
    renderPost();
    await waitFor(() => expect(screen.getByText("Mon pire date")).toBeTruthy());
  });
});
