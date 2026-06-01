import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface Group {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
}

export interface GroupMember {
  id: string;
  group_id: string;
  user_id: string;
  created_at: string;
}

export const useGroups = () => {
  const { user } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchGroups = async () => {
    if (!user) { setGroups([]); setLoading(false); return; }
    setLoading(true);

    // Get groups where user is a member
    const { data: memberships } = await (supabase as any)
      .from("group_members")
      .select("group_id")
      .eq("user_id", user.id);

    const memberGroupIds = (memberships || []).map((m: any) => m.group_id);

    // Get groups where user is the owner
    const { data: ownedGroups } = await (supabase as any)
      .from("groups")
      .select("*")
      .eq("owner_id", user.id);

    const ownedIds = new Set((ownedGroups || []).map((g: any) => g.id));

    // Get member groups that aren't already in owned
    let memberGroups: Group[] = [];
    const extraIds = memberGroupIds.filter((id: string) => !ownedIds.has(id));
    if (extraIds.length > 0) {
      const { data } = await (supabase as any)
        .from("groups")
        .select("*")
        .in("id", extraIds);
      memberGroups = (data || []) as Group[];
    }

    setGroups([...(ownedGroups || []), ...memberGroups] as Group[]);
    setLoading(false);
  };

  const createGroup = async (name: string) => {
    if (!user) return null;
    const { data, error } = await (supabase as any)
      .from("groups")
      .insert({ name, owner_id: user.id })
      .select()
      .single();
    if (error) throw error;

    // Auto-add owner as member
    await (supabase as any)
      .from("group_members")
      .insert({ group_id: data.id, user_id: user.id });

    await fetchGroups();
    return data as Group;
  };

  const deleteGroup = async (groupId: string) => {
    const { error } = await (supabase as any)
      .from("groups")
      .delete()
      .eq("id", groupId);
    if (error) throw error;
    await fetchGroups();
  };

  const addMember = async (groupId: string, userId: string) => {
    const { error } = await (supabase as any)
      .from("group_members")
      .insert({ group_id: groupId, user_id: userId });
    if (error) {
      if (error.code === "23505") return; // already a member
      throw error;
    }
  };

  const removeMember = async (groupId: string, userId: string) => {
    const { error } = await (supabase as any)
      .from("group_members")
      .delete()
      .eq("group_id", groupId)
      .eq("user_id", userId);
    if (error) throw error;
  };

  const getMembers = async (groupId: string): Promise<string[]> => {
    const { data } = await (supabase as any)
      .from("group_members")
      .select("user_id")
      .eq("group_id", groupId);
    return (data || []).map((m: any) => m.user_id);
  };

  useEffect(() => {
    fetchGroups();

    if (!user) return;

    // Realtime: refresh when group_members changes (e.g. user is added to a group by someone else)
    const channel = (supabase as any)
      .channel("group_members_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "group_members", filter: `user_id=eq.${user.id}` },
        () => { fetchGroups(); }
      )
      // Also refresh if a group we own gets a new member
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "group_members" },
        () => { fetchGroups(); }
      )
      .subscribe();

    return () => { (supabase as any).removeChannel(channel); };
  }, [user?.id]);

  return { groups, loading, fetchGroups, createGroup, deleteGroup, addMember, removeMember, getMembers };
};
