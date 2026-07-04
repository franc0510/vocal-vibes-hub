import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

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
  author: {
    name: string;
    username: string;
    avatar: string;
    avatarUrl?: string;
  };
  isLiked: boolean;
}

const CACHE_KEY = "vocme_feed_cache_v1";

const readCache = (): VoicePostWithAuthor[] => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
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
  const shuffledOrderRef = useRef<string[]>([]);
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
        author: {
          name: profile?.display_name || "User",
          username: profile?.username ? `@${profile.username}` : "@user",
          avatar: initials,
          avatarUrl: profile?.avatar_url || undefined,
        },
        isLiked: likedPostIds.has(p.id),
      });
    }

    // Sort: unlistened first, then bucket by engagement score, randomize within each bucket
    const allEntries = [...enrichedMap.values()];

    // Shuffle helper
    const shuffle = <T,>(arr: T[]): T[] => {
      const a = [...arr];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };

    // Score = likes + comments (engagement)
    const score = (p: VoicePostWithAuthor) => p.likes_count + p.comments_count;

    // Bucket thresholds: [high(10+), medium(3-9), low(1-2), zero(0)]
    const bucketize = (entries: VoicePostWithAuthor[]) => {
      const high: VoicePostWithAuthor[] = [];
      const medium: VoicePostWithAuthor[] = [];
      const low: VoicePostWithAuthor[] = [];
      const zero: VoicePostWithAuthor[] = [];

      for (const e of entries) {
        const s = score(e);
        if (s >= 10) high.push(e);
        else if (s >= 3) medium.push(e);
        else if (s >= 1) low.push(e);
        else zero.push(e);
      }

      return [...shuffle(high), ...shuffle(medium), ...shuffle(low), ...shuffle(zero)];
    };

    // Separate unlistened vs listened
    const unlistened = allEntries.filter((p) => !listenedPostIds.has(p.id));
    const listened = allEntries.filter((p) => listenedPostIds.has(p.id));

    // Bucketize each group separately, unlistened first
    const ordered = [...bucketize(unlistened), ...bucketize(listened)];

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
