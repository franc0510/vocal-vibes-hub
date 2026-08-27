import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { orderFeed, isIllustrated } from "@/lib/feedOrder";
import { parseSegments, type TimedSegment } from "@/lib/captions";

export interface VoicePostWithAuthor {
  id: string;
  user_id: string;
  title: string;
  audio_url: string;
  duration: number;
  likes_count: number;
  comments_count: number;
  shares_count: number;
  created_at: string;
  transcription?: string | null;
  image_url?: string | null;
  location?: string | null;
  group_id?: string | null;
  illustration_status?: string | null;
  illustration_cover_url?: string | null;
  video_url?: string | null;
  video_status?: string | null;
  duration_ms?: number | null;
  transcription_segments?: TimedSegment[] | null;
  author: {
    name: string;
    username: string;
    avatar: string;
    avatarUrl?: string;
  };
  isLiked: boolean;
}

// v2: entries cached under v1 were written before anecdotes could be
// illustrated, so every one of them carries illustration_status "none" and no
// video_url. That cache is what paints the first screen, which meant a phone
// that had opened the app even once kept showing the pre-illustration order
// until the network answered. Renaming the key retires those rows for good.
const CACHE_KEY = "vocme_feed_cache_v2";
const STALE_CACHE_KEYS = ["vocme_feed_cache_v1"];

const readCache = (): VoicePostWithAuthor[] => {
  try {
    for (const old of STALE_CACHE_KEYS) localStorage.removeItem(old);

    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const rows: VoicePostWithAuthor[] = Array.isArray(parsed) ? parsed : [];

    // The cache decides what the first paint looks like, so it owes the same
    // promise as the feed itself: illustrated anecdotes lead. Without this a
    // stale ordering could bury them until the fetch lands.
    return [...rows.filter(isIllustrated), ...rows.filter((p) => !isIllustrated(p))];
  } catch {
    return [];
  }
};

const writeCache = (posts: VoicePostWithAuthor[]) => {
  try {
    // Only cache the first 10 to keep it light + fast
    localStorage.setItem(CACHE_KEY, JSON.stringify(posts.slice(0, 10)));
  } catch {
    /* ignore quota errors */
  }
};

export const useVoicePosts = () => {
  const { user } = useAuth();
  // Hydrate instantly from cache so the first reals appear immediately
  const [posts, setPosts] = useState<VoicePostWithAuthor[]>(() => readCache());
  const [loading, setLoading] = useState(() => readCache().length === 0);
  const [allFetched, setAllFetched] = useState(false);
  // Keep the full ordered list internally; only expose chunks progressively
  const fullListRef = useRef<VoicePostWithAuthor[]>([]);
  const PAGE_SIZE = 5;

  const fetchPosts = async () => {
    setLoading(true);

    const { data: postsData, error } = await supabase
      .from("voice_posts")
      .select("*, transcription, image_url, location")
      .order("created_at", { ascending: false });

    if (error || !postsData) {
      setLoading(false);
      return;
    }

    // Get unique user ids
    const userIds = [...new Set(postsData.map((p) => p.user_id))];
    const postIds = postsData.map((p) => p.id);

    // Fetch blocked users to filter them out
    let blockedUserIds = new Set<string>();
    if (user) {
      const { data: blockedUsers } = await (supabase as any)
        .from("blocks")
        .select("blocked_user_id")
        .eq("user_id", user.id);
      blockedUserIds = new Set((blockedUsers || []).map((b: any) => b.blocked_user_id));
    }

    // Run all the dependent lookups in PARALLEL
    const [
      { data: profiles },
      { data: allLikes },
      { data: allComments },
      { data: myLikes },
      { data: listenedRows },
    ] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, display_name, username, avatar_url")
        .in("id", userIds),
      supabase.from("voice_post_likes").select("post_id").in("post_id", postIds),
      supabase.from("comments").select("post_id").in("post_id", postIds),
      user
        ? supabase.from("voice_post_likes").select("post_id").eq("user_id", user.id)
        : Promise.resolve({ data: [] as { post_id: string }[] }),
      user
        ? supabase.from("listened_posts").select("post_id").eq("user_id", user.id)
        : Promise.resolve({ data: [] as { post_id: string }[] }),
    ]);

    const profileMap = new Map((profiles || []).map((p) => [p.id, p]));

    // Tally like & comment counts client-side from the two batch queries
    const likeCountMap = new Map<string, number>();
    for (const l of allLikes || []) likeCountMap.set(l.post_id, (likeCountMap.get(l.post_id) || 0) + 1);
    const commentCountMap = new Map<string, number>();
    for (const c of allComments || []) commentCountMap.set(c.post_id, (commentCountMap.get(c.post_id) || 0) + 1);

    const likedPostIds = new Set((myLikes || []).map((l: any) => l.post_id));
    const listenedPostIds = new Set((listenedRows || []).map((l: any) => l.post_id));

    const enrichedMap = new Map<string, VoicePostWithAuthor>();
    for (const p of postsData) {
      // Skip blocked users' posts
      if (blockedUserIds.has(p.user_id)) continue;

      const profile = profileMap.get(p.user_id);
      const initials = (profile?.display_name || "U")
        .split(" ")
        .map((w: string) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();

      enrichedMap.set(p.id, {
        ...p,
        likes_count: likeCountMap.get(p.id) ?? p.likes_count ?? 0,
        comments_count: commentCountMap.get(p.id) ?? p.comments_count ?? 0,
        transcription: p.transcription || (p as any).transcription || null,
        image_url: p.image_url || (p as any).image_url || null,
        location: p.location || (p as any).location || null,
        transcription_segments: parseSegments(p.transcription_segments),
        author: {
          name: profile?.display_name || "User",
          username: profile?.username ? `@${profile.username}` : "@user",
          avatar: initials,
          avatarUrl: profile?.avatar_url || undefined,
        },
        isLiked: likedPostIds.has(p.id),
      });
    }

    // Illustrated anecdotes lead the feed; inside each group the existing
    // rules stand (unheard first, then engagement bands, shuffled within a
    // band). See src/lib/feedOrder.ts.
    const ordered = orderFeed([...enrichedMap.values()], listenedPostIds);

    fullListRef.current = ordered;
    // Expose only the first PAGE_SIZE initially (instant render)
    setPosts(ordered.slice(0, PAGE_SIZE));
    writeCache(ordered);
    setAllFetched(false);
    setLoading(false);
  };

  /** Load the next chunk of 5 posts into the visible list (called by RealsViewer when nearing the end). */
  const loadMore = () => {
    const full = fullListRef.current;
    if (full.length === 0) return;
    setPosts((prev) => {
      if (prev.length >= full.length) {
        setAllFetched(true);
        return prev;
      }
      const next = full.slice(0, prev.length + PAGE_SIZE);
      return next;
    });
  };

  useEffect(() => {
    fetchPosts();

    const channel = supabase
      .channel("voice_posts_realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "voice_posts" }, () => {
        fetchPosts();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "voice_post_likes" }, () => {
        fetchPosts();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "comments" }, () => {
        fetchPosts();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  return { posts, loading, refetch: fetchPosts, loadMore, allFetched };
};
