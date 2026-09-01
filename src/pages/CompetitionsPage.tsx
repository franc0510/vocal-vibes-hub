import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Trophy, Plus, Users, Calendar, KeyRound, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import BottomNav from "@/components/BottomNav";
import { useCompetitions, type Competition } from "@/hooks/useCompetitions";

/**
 * L'écran d'accueil des compétitions — celui qui remplace Weekly dans la nav.
 *
 * Deux listes et rien d'autre : celles où je joue, celles que je peux
 * rejoindre. Un code pour les privées.
 */

const dayCount = (c: Competition) => {
  const start = new Date(c.starts_on);
  const end = new Date(c.ends_on);
  return Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
};

const statusOf = (c: Competition) => {
  const today = new Date().toISOString().slice(0, 10);
  if (c.closed_at || c.ends_on < today) return { label: "Terminée", tone: "text-muted-foreground" };
  if (c.starts_on > today) {
    const days = Math.round((new Date(c.starts_on).getTime() - Date.now()) / 86400000);
    return { label: days <= 1 ? "Demain" : `Dans ${days} jours`, tone: "text-amber-400" };
  }
  return { label: "En cours", tone: "text-primary" };
};

const CompetitionCard = ({ competition, onOpen }: { competition: Competition; onOpen: () => void }) => {
  const status = statusOf(competition);
  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      onClick={onOpen}
      className="w-full text-left bg-card border border-border/40 rounded-2xl p-4 flex items-center gap-3"
    >
      <div className="w-11 h-11 rounded-xl gradient-red flex items-center justify-center shrink-0">
        <Trophy size={20} className="text-primary-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-foreground truncate">{competition.name}</p>
        <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground">
          <span className={status.tone}>{status.label}</span>
          <span className="flex items-center gap-1">
            <Calendar size={11} />{dayCount(competition)} jours
          </span>
          {competition.prize && <span className="truncate">🏆 {competition.prize}</span>}
        </div>
      </div>
      <ChevronRight size={18} className="text-muted-foreground shrink-0" />
    </motion.button>
  );
};

const CompetitionsPage = () => {
  const navigate = useNavigate();
  const { mine, open, loading, join, findByCode } = useCompetitions();
  const [code, setCode] = useState("");
  const [joining, setJoining] = useState(false);

  const joinByCode = async () => {
    if (!code.trim()) return;
    setJoining(true);
    try {
      const found = await findByCode(code);
      if (!found) {
        toast.error("Aucune compétition avec ce code.");
        return;
      }
      await join(found.id);
      toast.success(`Bienvenue dans « ${found.name} » !`);
      setCode("");
      navigate(`/competitions/${found.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Impossible de rejoindre.");
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-28">
      <header className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border/40"
              style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="text-xl font-bold text-foreground">Compétitions</h1>
          <button
            onClick={() => navigate("/competitions/new")}
            className="flex items-center gap-1 text-sm font-medium text-primary"
          >
            <Plus size={18} /> Créer
          </button>
        </div>
      </header>

      <div className="px-4 pt-4 space-y-6">
        {loading && <p className="text-sm text-muted-foreground">Chargement…</p>}

        {!loading && mine.length === 0 && open.length === 0 && (
          <div className="text-center py-16">
            <Trophy size={40} className="mx-auto text-muted-foreground mb-3" />
            <p className="text-foreground font-medium">Aucune compétition pour l'instant</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-xs mx-auto">
              Lance un défi entre écoles, anime un mariage ou un séminaire — ou
              rejoins-en une avec un code.
            </p>
            <button
              onClick={() => navigate("/competitions/new")}
              className="mt-5 px-5 py-2.5 rounded-full gradient-red text-primary-foreground font-medium text-sm"
            >
              Créer une compétition
            </button>
          </div>
        )}

        {mine.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Où je joue
            </h2>
            {mine.map((c) => (
              <CompetitionCard key={c.id} competition={c} onOpen={() => navigate(`/competitions/${c.id}`)} />
            ))}
          </section>
        )}

        {open.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
              <Users size={12} /> Ouvertes à tous
            </h2>
            {open.map((c) => (
              <CompetitionCard key={c.id} competition={c} onOpen={() => navigate(`/competitions/${c.id}`)} />
            ))}
          </section>
        )}

        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
            <KeyRound size={12} /> Rejoindre avec un code
          </h2>
          <div className="flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABC123"
              maxLength={6}
              className="flex-1 bg-card border border-border/40 rounded-xl px-4 py-2.5 text-foreground tracking-[0.2em] font-mono uppercase placeholder:tracking-normal placeholder:font-sans"
            />
            <button
              onClick={joinByCode}
              disabled={joining || code.length < 4}
              className="px-5 rounded-xl gradient-red text-primary-foreground font-medium text-sm disabled:opacity-40"
            >
              Rejoindre
            </button>
          </div>
        </section>
      </div>

      <BottomNav />
    </div>
  );
};

export default CompetitionsPage;
