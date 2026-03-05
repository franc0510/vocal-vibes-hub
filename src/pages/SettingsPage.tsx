import { useState, useEffect } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";

const SettingsPage = () => {
  const { user, profile, refreshProfile, signOut } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [saving, setSaving] = useState(false);

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

  return (
    <div className="min-h-screen pb-24 px-4 pt-4">
      <header className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-lg font-bold font-display text-foreground">Paramètres</h1>
      </header>

      <div className="space-y-5">
        {/* Profile Section */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Profil</h2>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Nom d'affichage</label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Ton nom..."
              className="w-full bg-card border border-border/50 rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/50 transition-shadow"
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Nom d'utilisateur</label>
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
              placeholder="Parle de toi..."
              rows={3}
              maxLength={150}
              className="w-full bg-card border border-border/50 rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/50 transition-shadow resize-none"
            />
            <p className="text-[10px] text-muted-foreground text-right">{bio.length}/150</p>
          </div>
        </section>

        {/* Privacy Section */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Confidentialité</h2>

          <div className="flex items-center justify-between bg-card border border-border/50 rounded-xl px-4 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">Compte privé</p>
              <p className="text-xs text-muted-foreground">Seuls tes abonnés peuvent voir tes vocaux</p>
            </div>
            <Switch checked={isPrivate} onCheckedChange={setIsPrivate} />
          </div>
        </section>

        {/* Actions */}
        <section className="space-y-3 pt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full gradient-red text-primary-foreground py-3 rounded-xl text-sm font-medium shadow-red flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saving && <Loader2 size={16} className="animate-spin" />}
            {saving ? "Sauvegarde..." : "Sauvegarder"}
          </button>

          <button
            onClick={signOut}
            className="w-full bg-card border border-destructive/30 text-destructive py-3 rounded-xl text-sm font-medium hover:bg-destructive/10 transition-colors"
          >
            Se déconnecter
          </button>
        </section>
      </div>
    </div>
  );
};

export default SettingsPage;
