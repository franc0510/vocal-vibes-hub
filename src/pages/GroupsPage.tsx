import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2, Users, ChevronLeft, X, Check, Share2, Copy, KeyRound } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useGroups, type Group } from "@/hooks/useGroups";
import { useAuth } from "@/contexts/AuthContext";
import { useFollows } from "@/hooks/useFollows";
import { supabase } from "@/integrations/supabase/client";
import { groupInviteUrl } from "@/lib/appUrl";

interface Profile {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
}

/**
 * La feuille de partage d'un groupe.
 *
 * Le code ET le lien, parce qu'ils ne servent pas au même moment : le lien se
 * colle dans une conversation, le code se dicte au téléphone ou s'écrit au
 * tableau. N'en donner qu'un obligeait à expliquer l'autre.
 */
const ShareGroupSheet = ({ group, onClose }: { group: Group; onClose: () => void }) => {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  /**
   * Bâti sur l'origine déclarée et non sur `window.location.origin` : dans
   * l'application iOS, cette dernière vaut `capacitor://localhost` et
   * produirait un lien mort pour tous ceux qui le reçoivent.
   */
  const link = group.join_code ? groupInviteUrl(group.join_code) : null;
  const inviteText = link
    ? `Join "${group.name}" on VocMe: ${link}`
    : `Join "${group.name}" on VocMe!`;

  const copyCode = async () => {
    if (!group.join_code) return;
    try {
      await navigator.clipboard.writeText(group.join_code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
      toast.success("Code copied");
    } catch {
      toast.error("Could not copy the code.");
    }
  };

  const copyLink = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
      toast.success("Link copied");
    } catch {
      toast.error("Could not copy the link.");
    }
  };

  const shareInvite = async () => {
    try {
      // L'URL est aussi dans le texte : plusieurs applications de messagerie
      // ignorent le champ `url` de la feuille de partage et n'enverraient que
      // la phrase, sans le lien.
      if (navigator.share) {
        await navigator.share(link ? { text: inviteText, url: link } : { text: inviteText });
      } else {
        await navigator.clipboard.writeText(inviteText);
        toast.success("Invite copied");
      }
    } catch { /* partage annulé */ }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-background/80 backdrop-blur flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 40 }} animate={{ y: 0 }} exit={{ y: 40 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-card border-t sm:border border-border/40 sm:rounded-2xl p-5 space-y-4"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" }}
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-bold text-foreground min-w-0 truncate">Invite to {group.name}</h2>
          <button onClick={onClose} className="p-1 text-muted-foreground shrink-0">
            <X size={18} />
          </button>
        </div>

        {group.join_code ? (
          <button
            onClick={copyCode}
            className="w-full rounded-xl border border-border/50 bg-background px-4 py-4 flex items-center justify-between gap-3"
          >
            <span className="font-mono text-2xl font-bold tracking-[0.25em] text-foreground min-w-0 truncate">
              {group.join_code}
            </span>
            <span className="flex items-center gap-1.5 text-xs font-medium text-primary shrink-0">
              {copiedCode ? <Check size={14} /> : <Copy size={14} />}
              {copiedCode ? "Copied" : "Copy"}
            </span>
          </button>
        ) : (
          // Un groupe d'avant la migration, pas encore rechargé : mieux vaut le
          // dire que d'afficher un lien qui ne mène nulle part.
          <p className="text-sm text-muted-foreground">
            This group has no share code yet. Reopen the app in a moment and it
            will be there.
          </p>
        )}

        {link && (
          <button
            onClick={copyLink}
            className="w-full rounded-xl border border-border/50 bg-background px-4 py-3 flex items-center justify-between gap-3 text-left"
          >
            <span className="text-xs text-muted-foreground min-w-0 truncate">{link}</span>
            <span className="flex items-center gap-1.5 text-xs font-medium text-primary shrink-0">
              {copiedLink ? <Check size={14} /> : <Copy size={14} />}
              {copiedLink ? "Copied" : "Copy link"}
            </span>
          </button>
        )}

        <p className="text-sm text-muted-foreground">
          The link adds them to the group straight away — even if they don't
          have VocMe yet. The code works too, from the Groups screen.
        </p>

        <button
          onClick={shareInvite}
          className="w-full rounded-xl gradient-red text-primary-foreground font-medium py-3 flex items-center justify-center gap-2"
        >
          <Share2 size={16} /> Share invite
        </button>
      </motion.div>
    </motion.div>
  );
};

const GroupsPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    groups, loading, createGroup, deleteGroup,
    addMember, removeMember, getMembers, joinWithCode,
  } = useGroups();
  const { followingIds } = useFollows();

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<string[]>([]);
  const [followingProfiles, setFollowingProfiles] = useState<Profile[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [code, setCode] = useState("");
  const [joining, setJoining] = useState(false);

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

  /**
   * Entrer dans un groupe avec le code qu'on vous a dicté.
   *
   * Le pendant du lien : tout le monde ne reçoit pas une invitation
   * cliquable — on lit parfois un code à voix haute, ou on le recopie d'un
   * tableau.
   */
  const joinByCode = async () => {
    if (!code.trim()) return;
    setJoining(true);
    try {
      const joined = await joinWithCode(code);
      if (!joined) {
        toast.error("No group with that code.");
        return;
      }
      toast.success(`Welcome to "${joined.name}"!`);
      setCode("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not join.");
    } finally {
      setJoining(false);
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
          {/* Inviter n'est pas un privilège de propriétaire : un groupe
              s'agrandit par ceux qui y sont. */}
          <button
            onClick={() => setSharing(true)}
            className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center"
            aria-label="Invite to this group"
          >
            <Share2 size={16} className="text-foreground" />
          </button>
          {user && selectedGroup.owner_id === user.id && (
            <button onClick={() => handleDelete(selectedGroup)} className="w-9 h-9 rounded-full bg-destructive/20 flex items-center justify-center">
              <Trash2 size={16} className="text-destructive" />
            </button>
          )}
        </header>

        {/*
          Le code d'abord, la liste des connaissances ensuite : « ajouter
          depuis mes abonnements » ne sert que si l'on se suit déjà. Inviter
          quelqu'un qu'on ne suit pas — la moitié d'un groupe, en pratique —
          était tout simplement impossible avant.
        */}
        {selectedGroup.join_code && (
          <button
            onClick={() => setSharing(true)}
            className="w-full mb-4 rounded-xl border border-border/50 bg-card px-4 py-3 flex items-center gap-3 text-left"
          >
            <div className="w-9 h-9 rounded-full gradient-red flex items-center justify-center shrink-0">
              <Share2 size={16} className="text-primary-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-foreground">Invite with a code or link</p>
              <p className="font-mono text-xs tracking-[0.2em] text-muted-foreground truncate">
                {selectedGroup.join_code}
              </p>
            </div>
            <ChevronLeft size={16} className="text-muted-foreground rotate-180 shrink-0" />
          </button>
        )}

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

        <AnimatePresence>
          {sharing && (
            <ShareGroupSheet group={selectedGroup} onClose={() => setSharing(false)} />
          )}
        </AnimatePresence>
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
          <p className="text-xs text-muted-foreground">
            Create a group to share VocMe with specific people — or join one with a code
          </p>
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

      {/*
        Le pendant du lien. Tout le monde ne reçoit pas une invitation
        cliquable : un code se dicte au téléphone, se recopie d'un tableau, se
        lit à voix haute au milieu d'un dîner.
      */}
      <section className="space-y-2 mt-6">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
          <KeyRound size={12} /> Join with a code
        </h2>
        <div className="flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ABC123"
            maxLength={6}
            aria-label="Group code"
            className="flex-1 min-w-0 bg-card border border-border/40 rounded-xl px-4 py-2.5 text-foreground tracking-[0.2em] font-mono uppercase placeholder:tracking-normal placeholder:font-sans"
            onKeyDown={(e) => e.key === "Enter" && joinByCode()}
          />
          <button
            onClick={joinByCode}
            disabled={joining || code.length < 4}
            className="px-5 shrink-0 rounded-xl gradient-red text-primary-foreground font-medium text-sm disabled:opacity-40"
          >
            Join
          </button>
        </div>
      </section>
    </div>
  );
};

export default GroupsPage;
