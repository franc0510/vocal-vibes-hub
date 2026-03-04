import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export const useFollows = (targetUserId?: string) => {
  const { user } = useAuth();
  const [isFollowing, setIsFollowing] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [followingIds, setFollowingIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchCounts = async (uid: string) => {
    const [followers, following] = await Promise.all([
      supabase.from("follows").select("id", { count: "exact", head: true }).eq("following_id", uid),
      supabase.from("follows").select("id", { count: "exact", head: true }).eq("follower_id", uid),
    ]);
    setFollowersCount(followers.count || 0);
    setFollowingCount(following.count || 0);
  };

  const fetchIsFollowing = async () => {
    if (!user || !targetUserId || user.id === targetUserId) return;
    const { data } = await supabase
      .from("follows")
      .select("id")
      .eq("follower_id", user.id)
      .eq("following_id", targetUserId)
      .maybeSingle();
    setIsFollowing(!!data);
  };

  const fetchFollowingIds = async () => {
    if (!user) { setFollowingIds([]); return; }
    const { data } = await supabase
      .from("follows")
      .select("following_id")
      .eq("follower_id", user.id);
    setFollowingIds((data || []).map((d) => d.following_id));
  };

  useEffect(() => {
    if (targetUserId) {
      fetchCounts(targetUserId);
      fetchIsFollowing();
    }
    fetchFollowingIds();
  }, [user?.id, targetUserId]);

  const toggleFollow = async () => {
    if (!user || !targetUserId) return;
    setLoading(true);
    if (isFollowing) {
      await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", targetUserId);
      setIsFollowing(false);
      setFollowersCount((c) => Math.max(0, c - 1));
    } else {
      await supabase.from("follows").insert({ follower_id: user.id, following_id: targetUserId });
      setIsFollowing(true);
      setFollowersCount((c) => c + 1);
    }
    await fetchFollowingIds();
    setLoading(false);
  };

  return { isFollowing, followersCount, followingCount, followingIds, toggleFollow, loading, refetchFollowingIds: fetchFollowingIds };
};
