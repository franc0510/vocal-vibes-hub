import { describe, it, expect } from "vitest";
import { orderFeed, isIllustrated, countToReveal, type FeedCandidate } from "./feedOrder";

/** No shuffling, so the ordering rules alone decide. */
const stable = <T,>(a: T[]): T[] => [...a];

const post = (id: string, over: Partial<FeedCandidate> = {}): FeedCandidate => ({
  id,
  likes_count: 0,
  comments_count: 0,
  ...over,
});

describe("isIllustrated", () => {
  it("counts a post with panels, even before its video exists", () => {
    expect(isIllustrated(post("a", { illustration_status: "ready" }))).toBe(true);
  });

  it("counts a post that has a video", () => {
    expect(isIllustrated(post("a", { video_url: "http://v.mp4" }))).toBe(true);
  });

  it("does not count one still generating, or failed", () => {
    expect(isIllustrated(post("a", { illustration_status: "pending" }))).toBe(false);
    expect(isIllustrated(post("a", { illustration_status: "failed" }))).toBe(false);
    expect(isIllustrated(post("a"))).toBe(false);
  });
});

describe("orderFeed", () => {
  it("puts illustrated anecdotes ahead of everything else", () => {
    const entries = [
      post("plain", { likes_count: 500 }),
      post("video", { illustration_status: "ready" }),
    ];
    expect(orderFeed(entries, new Set(), stable).map((p) => p.id)).toEqual(["video", "plain"]);
  });

  it("prefers unheard within the illustrated group", () => {
    const entries = [
      post("seen", { illustration_status: "ready" }),
      post("fresh", { illustration_status: "ready" }),
    ];
    const order = orderFeed(entries, new Set(["seen"]), stable).map((p) => p.id);
    expect(order).toEqual(["fresh", "seen"]);
  });

  it("keeps engagement bands inside each group", () => {
    const entries = [
      post("quiet", { illustration_status: "ready" }),
      post("popular", { illustration_status: "ready", likes_count: 20 }),
      post("some", { illustration_status: "ready", likes_count: 4 }),
    ];
    expect(orderFeed(entries, new Set(), stable).map((p) => p.id)).toEqual([
      "popular",
      "some",
      "quiet",
    ]);
  });

  it("accepts the trade-off: a seen video outranks an unheard plain post", () => {
    // The literal reading of "all the ones with a video first".
    const entries = [post("plainFresh"), post("videoSeen", { illustration_status: "ready" })];
    const order = orderFeed(entries, new Set(["videoSeen"]), stable).map((p) => p.id);
    expect(order).toEqual(["videoSeen", "plainFresh"]);
  });

  it("keeps every post exactly once", () => {
    const entries = [
      post("a", { illustration_status: "ready" }),
      post("b"),
      post("c", { video_url: "http://v" }),
      post("d", { likes_count: 12 }),
    ];
    const order = orderFeed(entries, new Set(["b"]), stable);
    expect(order).toHaveLength(4);
    expect(new Set(order.map((p) => p.id)).size).toBe(4);
  });

  it("handles an empty feed", () => {
    expect(orderFeed([], new Set(), stable)).toEqual([]);
  });
});

describe("countToReveal", () => {
  const full = [post("a"), post("b"), post("c"), post("d"), post("e"), post("f")];

  it("dit combien montrer pour atteindre une anecdote plus bas", () => {
    // The feed shows five; the tapped tile is the sixth.
    expect(countToReveal(full, 5, "f")).toBe(6);
  });

  it("ne réduit jamais la liste déjà visible", () => {
    // Shrinking under a reader who has scrolled would yank the page.
    expect(countToReveal(full, 6, "a")).toBe(6);
  });

  it("laisse le compte tel quel si l'anecdote est déjà visible", () => {
    expect(countToReveal(full, 5, "c")).toBe(5);
  });

  it("rend null pour une anecdote absente du feed", () => {
    // A group anecdote, or one from a blocked author.
    expect(countToReveal(full, 5, "inconnue")).toBeNull();
  });

  it("rend null sur un feed vide plutôt que 0", () => {
    expect(countToReveal([], 0, "a")).toBeNull();
  });
});
