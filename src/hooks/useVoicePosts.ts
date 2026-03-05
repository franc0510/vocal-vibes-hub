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
  author: {
    name: string;
    username: string;
    avatar: string;
    avatarUrl?: string;
  };
  isLiked: boolean;
}

export const useVoicePosts = () => {
  const { user } = useAuth();
  const [posts, setPosts] = useState<VoicePostWithAuthor[]>([]);
  const [loading, setLoading] = useState(true);
  const shuffledOrderRef = useRef<string[]>([]);

  const fetchPosts = async () => {
    setLoading(true);

    const { data: postsData, error } = await supabase
      .from("voice_posts")
      .select("*")
      .order("created_at", { ascending: false });

    if (error || !postsData) {
      setLoading(false);
      return;
    }

    // Get unique user ids
    const userIds = [...new Set(postsData.map((p) => p.user_id))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, username, avatar_url")
      .in("id", userIds);

    const profileMap = new Map(
      (profiles || []).map((p) => [p.id, p])
    );

    // Get user's likes
    let likedPostIds = new Set<string>();
    if (user) {
      const { data: likes } = await supabase
        .from("voice_post_likes")
        .select("post_id")
        .eq("user_id", user.id);
      likedPostIds = new Set((likes || []).map((l) => l.post_id));
    }

    const enrichedMap = new Map<string, VoicePostWithAuthor>();
    postsData.forEach((p) => {
      const profile = profileMap.get(p.user_id);
      const initials = (profile?.display_name || "U")
        .split(" ")
        .map((w: string) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();
      enrichedMap.set(p.id, {
        ...p,
        author: {
          name: profile?.display_name || "User",
          username: profile?.username ? `@${profile.username}` : "@user",
          avatar: initials,
          avatarUrl: profile?.avatar_url || undefined,
        },
        isLiked: likedPostIds.has(p.id),
      });
    });

    // Only shuffle once; on subsequent fetches, keep the same order and append new posts
    const currentIds = new Set(enrichedMap.keys());
    if (shuffledOrderRef.current.length === 0) {
      // First load: shuffle
      const ids = [...currentIds];
      for (let i = ids.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [ids[i], ids[j]] = [ids[j], ids[i]];
      }
      shuffledOrderRef.current = ids;
    } else {
      // Keep existing order, remove deleted, append new
      const existing = shuffledOrderRef.current.filter((id) => currentIds.has(id));
      const newIds = [...currentIds].filter((id) => !shuffledOrderRef.current.includes(id));
      shuffledOrderRef.current = [...newIds, ...existing];
    }

    const ordered = shuffledOrderRef.current
      .map((id) => enrichedMap.get(id))
      .filter(Boolean) as VoicePostWithAuthor[];

    setPosts(ordered);
    setLoading(false);
  };

  useEffect(() => {
    fetchPosts();

    const channel = supabase
      .channel("voice_posts_realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "voice_posts" }, () => {
        fetchPosts();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  return { posts, loading, refetch: fetchPosts };
};
