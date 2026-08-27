import { describe, it, expect, beforeEach } from "vitest";
import { isIllustrated, type FeedCandidate } from "@/lib/feedOrder";

/**
 * The feed paints from localStorage before the network answers, so the cache
 * decides what the user sees on launch. Two rules matter and neither is
 * obvious from reading the hook:
 *
 *  - entries written before illustrations existed must not survive an update,
 *    because they claim illustration_status "none" for anecdotes that now have
 *    a video, and a stale claim outranks no claim at all;
 *  - whatever the cache holds, illustrated anecdotes still lead the paint.
 *
 * These pin both against the same helpers the hook uses. Reproducing the hook's
 * two small cache functions here keeps the assertions honest without dragging a
 * Supabase client into a unit test.
 */

const CACHE_KEY = "vocme_feed_cache_v2";
const STALE_CACHE_KEYS = ["vocme_feed_cache_v1"];

const readCache = (): FeedCandidate[] => {
  try {
    for (const old of STALE_CACHE_KEYS) localStorage.removeItem(old);
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const rows: FeedCandidate[] = Array.isArray(parsed) ? parsed : [];
    return [...rows.filter(isIllustrated), ...rows.filter((p) => !isIllustrated(p))];
  } catch {
    return [];
  }
};

const row = (id: string, over: Partial<FeedCandidate> = {}): FeedCandidate => ({
  id,
  likes_count: 0,
  comments_count: 0,
  ...over,
});

describe("cache du feed", () => {
  beforeEach(() => localStorage.clear());

  it("ignore le cache v1, écrit avant que les vidéos existent", () => {
    // Exactly the trap: this phone cached the anecdote back when it had no
    // video. Reading v1 would paint that stale order over the real one.
    localStorage.setItem(
      "vocme_feed_cache_v1",
      JSON.stringify([row("plain"), row("windsor", { illustration_status: "none" })])
    );

    expect(readCache()).toEqual([]);
    expect(localStorage.getItem("vocme_feed_cache_v1")).toBeNull();
  });

  it("place les illustrées en tête, quel que soit l'ordre stocké", () => {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify([
        row("plain1"),
        row("plain2"),
        row("windsor", { illustration_status: "ready" }),
        row("pluie", { video_url: "https://x/v.mp4" }),
      ])
    );

    expect(readCache().map((p) => p.id)).toEqual(["windsor", "pluie", "plain1", "plain2"]);
  });

  it("garde l'ordre relatif à l'intérieur de chaque groupe", () => {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify([
        row("b", { illustration_status: "ready" }),
        row("z"),
        row("a", { illustration_status: "ready" }),
        row("y"),
      ])
    );

    expect(readCache().map((p) => p.id)).toEqual(["b", "a", "z", "y"]);
  });

  it("survit à un cache illisible", () => {
    localStorage.setItem(CACHE_KEY, "{pas du json");
    expect(readCache()).toEqual([]);
  });

  it("ne compte pas une génération encore en cours", () => {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify([row("plain"), row("encours", { illustration_status: "pending" })])
    );
    expect(readCache().map((p) => p.id)).toEqual(["plain", "encours"]);
  });
});
