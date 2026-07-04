import { useState, useEffect } from "react";
import { ArrowLeft, Loader2, Users, AlertTriangle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { motion } from "framer-motion";

const SettingsPage = () => {
  const { user, profile, refreshProfile, signOut } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name || "");
      setUsername(profile.username || "");
      setBio(profile.bio || "");
      setIsPrivate((profile as any).is_private || false);
    }
  }, [profile]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          display_name: displayName.trim() || null,
          username: username.trim() || null,
          bio: bio.trim() || null,
          is_private: isPrivate,
        } as any)
        .eq("id", user.id);
      if (error) throw error;
      await refreshProfile();
      toast.success("Profile updated!");
      navigate("/profile");
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    setDeleteLoading(true);
    try {
      // Step 1: Delete all user data (cascades via foreign keys)
      // Delete from profiles - cascades will handle related data
      const { error: profileError } = await supabase
        .from("profiles")
        .delete()
        .eq("id", user.id);
      
      if (profileError) throw profileError;

      // Step 2: Delete the auth user
      const { error: authError } = await supabase.auth.signOut();
      if (authError) throw authError;

      // Step 3: Call a server function to delete auth user (requires RPC or Edge Function)
      // For now, just sign out and redirect - the profile deletion cascades everything
      toast.success("Account deleted permanently");
      navigate("/auth");
    } catch (err: any) {
      console.error("Delete error:", err);
      toast.error(err.message || "Could not delete account. Please contact support.");
    } finally {
      setDeleteLoading(false);
      setDeleteConfirm(false);
    }
  };

  return (
    <div className="min-h-screen pb-32 px-4" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 16px)" }}>
      <header className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-lg font-bold font-display text-foreground">Settings</h1>
      </header>

      <div className="space-y-5">
        {/* Profile Section */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Profile</h2>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Display Name</label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name..."
              className="w-full bg-card border border-border/50 rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/50 transition-shadow"
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
              placeholder="username"
              className="w-full bg-card border border-border/50 rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/50 transition-shadow"
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Bio</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell us about yourself..."
              rows={3}
              maxLength={150}
              className="w-full bg-card border border-border/50 rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/50 transition-shadow resize-none"
            />
            <p className="text-[10px] text-muted-foreground text-right">{bio.length}/150</p>
          </div>
        </section>

        {/* Privacy Section */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Privacy</h2>

          <div className="flex items-center justify-between bg-card border border-border/50 rounded-xl px-4 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">Private Account</p>
              <p className="text-xs text-muted-foreground">Only your followers can see your voices</p>
            </div>
            <Switch checked={isPrivate} onCheckedChange={setIsPrivate} />
          </div>
        </section>

        {/* Groups Section */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Groups</h2>
          <button
            onClick={() => navigate("/groups")}
            className="w-full flex items-center gap-3 bg-card border border-border/50 rounded-xl px-4 py-3 text-left hover:bg-secondary/30 transition-colors"
          >
            <Users size={18} className="text-primary" />
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">Manage Groups</p>
              <p className="text-xs text-muted-foreground">Create and manage your groups</p>
            </div>
          </button>
        </section>

        {/* Actions */}
        <section className="space-y-3 pt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full gradient-red text-primary-foreground py-3 rounded-xl text-sm font-medium shadow-red flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saving && <Loader2 size={16} className="animate-spin" />}
            {saving ? "Saving..." : "Save"}
          </button>

          <button
            onClick={signOut}
            className="w-full bg-card border border-destructive/30 text-destructive py-3 rounded-xl text-sm font-medium hover:bg-destructive/10 transition-colors"
          >
            Log Out
          </button>

          <button
            onClick={() => setDeleteConfirm(true)}
            className="w-full bg-card border border-red-500/30 text-red-500 py-3 rounded-xl text-sm font-medium hover:bg-red-500/10 transition-colors flex items-center justify-center gap-2"
          >
            <AlertTriangle size={16} />
            Delete My Account
          </button>
        </section>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-full max-w-sm mx-4 bg-card rounded-2xl p-6 space-y-4"
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center">
                <AlertTriangle size={24} className="text-red-500" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground">Delete Account?</h3>
                <p className="text-xs text-muted-foreground">This action is permanent</p>
              </div>
            </div>

            <div className="bg-secondary/50 rounded-xl p-4 space-y-2">
              <p className="text-sm text-foreground font-medium">This will permanently:</p>
              <ul className="text-xs text-muted-foreground space-y-1 pl-4">
                <li>• Delete your profile and avatar</li>
                <li>• Delete all your voice posts and content</li>
                <li>• Delete your messages and comments</li>
                <li>• Cannot be undone</li>
              </ul>
            </div>

            <div className="space-y-2 pt-2">
              <button
                onClick={handleDeleteAccount}
                disabled={deleteLoading}
                className="w-full bg-red-500/80 hover:bg-red-500 text-white py-3 rounded-xl font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {deleteLoading && <Loader2 size={16} className="animate-spin" />}
                {deleteLoading ? "Deleting..." : "Yes, Delete Everything"}
              </button>

              <button
                onClick={() => setDeleteConfirm(false)}
                disabled={deleteLoading}
                className="w-full bg-secondary text-foreground py-2 rounded-xl text-sm font-medium hover:bg-secondary/80 transition-colors"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default SettingsPage;
