/**
 * Ordering for the Reals feed.
 *
 * Illustrated anecdotes come first — they are the showcase, and the whole
 * point of paying to generate one. Inside each half the existing rules stand:
 * unheard before heard, then by engagement in bands, shuffled within a band so
 * the same posts do not lead every session.
 *
 * The cost of putting illustration above everything: an illustrated anecdote
 * you have already seen outranks a plain one you never heard. That is the
 * literal reading of "videos first". Swapping the two outer partitions puts
 * discovery back on top if that ever hurts.
 */

export interface FeedCandidate {
  id: string;
  likes_count: number;
  comments_count: number;
  illustration_status?: string | null;
  video_url?: string | null;
}

/**
 * How many posts must be visible for `postId` to be rendered.
 *
 * The feed reveals five at a time, so opening it on an anecdote chosen
 * elsewhere means widening that slice — but only ever widening it: shrinking
 * the list under a reader who has already scrolled would yank the page.
 *
 * Returns the current count unchanged when the post is already visible, and
 * null when it is not in the feed at all — a group anecdote, or one from a
 * blocked author, legitimately is not.
 */
export function countToReveal(
  full: readonly { id: string }[],
  visible: number,
  postId: string
): number | null {
  const at = full.findIndex((p) => p.id === postId);
  if (at < 0) return null;
  return Math.max(visible, at + 1);
}

/**
 * Newest first, by publication date.
 *
 * A profile is not a discovery surface: its grid is chronological, so the
 * viewer opened from a tile has to be chronological too. Ordering it like the
 * feed — illustrated first, then engagement bands, shuffled — left the reader
 * on a different anecdote from the one they had just touched.
 */
export function newestFirst<T extends { created_at: string }>(posts: readonly T[]): T[] {
  return [...posts].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** Fisher–Yates. Injectable so tests can make the order deterministic. */
export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** A post counts as illustrated once it has panels, video or not yet. */
export function isIllustrated(post: FeedCandidate): boolean {
  return post.illustration_status === "ready" || Boolean(post.video_url);
}

const score = (p: FeedCandidate) => p.likes_count + p.comments_count;

/** Engagement bands, shuffled inside each so the same posts do not always lead. */
function bucketize<T extends FeedCandidate>(entries: T[], mix: <U>(a: U[]) => U[]): T[] {
  const high: T[] = [];
  const medium: T[] = [];
  const low: T[] = [];
  const zero: T[] = [];

  for (const e of entries) {
    const s = score(e);
    if (s >= 10) high.push(e);
    else if (s >= 3) medium.push(e);
    else if (s >= 1) low.push(e);
    else zero.push(e);
  }

  return [...mix(high), ...mix(medium), ...mix(low), ...mix(zero)];
}

export function orderFeed<T extends FeedCandidate>(
  entries: T[],
  listenedIds: Set<string>,
  mix: <U>(a: U[]) => U[] = shuffle
): T[] {
  const illustrated = entries.filter(isIllustrated);
  const plain = entries.filter((e) => !isIllustrated(e));

  const split = (group: T[]) => ({
    unheard: group.filter((p) => !listenedIds.has(p.id)),
    heard: group.filter((p) => listenedIds.has(p.id)),
  });

  const withVideo = split(illustrated);
  const without = split(plain);

  return [
    ...bucketize(withVideo.unheard, mix),
    ...bucketize(withVideo.heard, mix),
    ...bucketize(without.unheard, mix),
    ...bucketize(without.heard, mix),
  ];
}
