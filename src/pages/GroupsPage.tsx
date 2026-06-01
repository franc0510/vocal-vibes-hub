import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2, Users, ChevronLeft, UserPlus, X, Check } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useGroups, type Group } from "@/hooks/useGroups";
import { useAuth } from "@/contexts/AuthContext";
import { useFollows } from "@/hooks/useFollows";
import { supabase } from "@/integrations/supabase/client";

interface Profile {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
}

const GroupsPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { groups, loading, createGroup, deleteGroup, addMember, removeMember, getMembers } = useGroups();
  const { followingIds } = useFollows();

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<string[]>([]);
  const [followingProfiles, setFollowingProfiles] = useState<Profile[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  // Load following profiles for member picker
  useEffect(() => {
    if (followingIds.length === 0) return;
    supabase
      .from("profiles")
      .select("id, display_name, username, avatar_url")
      .in("id", followingIds)
      .then(({ data }) => setFollowingProfiles((data as Profile[]) || []));
  }, [followingIds]);

  // Load members when a group is selected
  useEffect(() => {
    if (!selectedGroup) return;
    setLoadingMembers(true);
    getMembers(selectedGroup.id).then((m) => {
      setMembers(m);
      setLoadingMembers(false);
    });
  }, [selectedGroup?.id]);

  const handleCreate = async () => {
    if (!newName.trim()) { toast.error("Enter a group name"); return; }
    try {
      await createGroup(newName.trim());
      toast.success("Group created!");
      setNewName("");
      setCreating(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to create group");
    }
  };

  const handleDelete = async (group: Group) => {
    const confirmed = window.confirm(`Delete "${group.name}"?`);
    if (!confirmed) return;
    try {
      await deleteGroup(group.id);
      toast.success("Group deleted");
      if (selectedGroup?.id === group.id) setSelectedGroup(null);
    } catch {
      toast.error("Failed to delete group");
    }
  };

  const toggleMember = async (userId: string) => {
    if (!selectedGroup) return;
    try {
      if (members.includes(userId)) {
        await removeMember(selectedGroup.id, userId);
        setMembers((m) => m.filter((id) => id !== userId));
        toast.success("Member removed");
      } else {
        await addMember(selectedGroup.id, userId);
        setMembers((m) => [...m, userId]);
        toast.success("Member added");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed");
    }
  };

  if (selectedGroup) {
    return (
      <div
        className="w-full h-full flex flex-col overflow-y-auto"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)",
          paddingBottom: "100px",
          paddingLeft: "16px",
          paddingRight: "16px",
        }}
      >
        <header className="flex items-center gap-3 mb-4 shrink-0">
          <button onClick={() => setSelectedGroup(null)} className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center">
            <ChevronLeft size={18} />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold font-display text-foreground">{selectedGroup.name}</h1>
            <p className="text-xs text-muted-foreground">{members.length} member{members.length !== 1 ? "s" : ""}</p>
          </div>
          {user && selectedGroup.owner_id === user.id && (
            <button onClick={() => handleDelete(selectedGroup)} className="w-9 h-9 rounded-full bg-destructive/20 flex items-center justify-center">
              <Trash2 size={16} className="text-destructive" />
            </button>
          )}
        </header>

        <h3 className="text-sm font-bold text-foreground mb-2">Add from your following</h3>

        {loadingMembers ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : followingProfiles.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Follow users first to add them to groups</p>
        ) : (
          <div className="space-y-1">
            {followingProfiles.map((p) => {
              const isMember = members.includes(p.id);
              const isOwner = p.id === user?.id;
              const initials = (p.display_name || "U").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
              return (
                <button
                  key={p.id}
                  onClick={() => !isOwner && toggleMember(p.id)}
                  disabled={isOwner}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-secondary/60 transition-colors disabled:opacity-50"
                >
                  {p.avatar_url ? (
                    <img src={p.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover border border-border/30" />
                  ) : (
                    <div className="w-10 h-10 rounded-full gradient-red flex items-center justify-center text-xs font-bold text-primary-foreground">
                      {initials}
                    </div>
                  )}
                  <div className="flex-1 text-left">
                    <p className="text-sm font-medium text-foreground">{p.display_name || "User"}</p>
                    {p.username && <p className="text-xs text-muted-foreground">@{p.username}</p>}
                  </div>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center ${isMember ? "bg-primary" : "bg-secondary border border-border/50"}`}>
                    {isMember && <Check size={14} className="text-primary-foreground" />}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className="w-full h-full flex flex-col overflow-y-auto"
      style={{
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)",
        paddingBottom: "100px",
        paddingLeft: "16px",
        paddingRight: "16px",
      }}
    >
      <header className="flex items-center gap-3 mb-4 shrink-0">
        <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center">
          <ChevronLeft size={18} />
        </button>
        <h1 className="text-xl font-bold font-display text-gradient-red flex-1">Groups</h1>
        <button onClick={() => setCreating(true)} className="w-9 h-9 rounded-full gradient-red flex items-center justify-center shadow-red">
          <Plus size={18} className="text-primary-foreground" />
        </button>
      </header>

      {/* Create group inline */}
      <AnimatePresence>
        {creating && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden mb-3"
          >
            <div className="bg-card border border-border/50 rounded-xl p-3 flex gap-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Group name..."
                className="flex-1 bg-secondary rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/50"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
              <button onClick={handleCreate} className="gradient-red text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium shadow-red">
                Create
              </button>
              <button onClick={() => { setCreating(false); setNewName(""); }} className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center">
                <X size={16} className="text-muted-foreground" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Users size={40} className="text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-foreground mb-1">No groups yet</p>
          <p className="text-xs text-muted-foreground">Create a group to share VocMe with specific people</p>
        </div>
      ) : (
        <div className="space-y-2">
          {groups.map((group) => (
            <motion.button
              key={group.id}
              whileTap={{ scale: 0.98 }}
              onClick={() => setSelectedGroup(group)}
              className="w-full flex items-center gap-3 bg-card border border-border/50 rounded-xl p-4 text-left hover:bg-secondary/30 transition-colors shadow-card"
            >
              <div className="w-10 h-10 rounded-full gradient-red flex items-center justify-center shadow-red">
                <Users size={18} className="text-primary-foreground" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-foreground">{group.name}</p>
                <p className="text-xs text-muted-foreground">
                  {user && group.owner_id === user.id ? "Owner" : "Member"}
                </p>
              </div>
              <ChevronLeft size={16} className="text-muted-foreground rotate-180" />
            </motion.button>
          ))}
        </div>
      )}
    </div>
  );
};

export default GroupsPage;
