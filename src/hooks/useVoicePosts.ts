import { useEffect, useState } from "react";
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
  };
  isLiked: boolean;
}

export const useVoicePosts = () => {
  const { user } = useAuth();
  const [posts, setPosts] = useState<VoicePostWithAuthor[]>([]);
  const [loading, setLoading] = useState(true);

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

    const enriched: VoicePostWithAuthor[] = postsData.map((p) => {
      const profile = profileMap.get(p.user_id);
      const initials = (profile?.display_name || "U")
        .split(" ")
        .map((w: string) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();
      return {
        ...p,
        author: {
          name: profile?.display_name || "User",
          username: profile?.username ? `@${profile.username}` : "@user",
          avatar: initials,
        },
        isLiked: likedPostIds.has(p.id),
      };
    });

    setPosts(enriched);
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
