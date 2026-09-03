import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Trophy, Plus, Users, Calendar, KeyRound, ChevronRight, Mic, Check, X } from "lucide-react";
import { toast } from "sonner";
import BottomNav from "@/components/BottomNav";
import { useCompetitions, type Competition } from "@/hooks/useCompetitions";
import { competitionDate, DEFAULT_TIMEZONE } from "@/lib/competitionClock";
import { useChallengeDigest, sortDigests, type ChallengeDigest } from "@/hooks/useChallengeDigest";

/**
 * L'écran d'accueil des défis — celui qui remplace Weekly dans la nav.
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
  // Dans le fuseau de la compétition, et avec la bascule à 4 h : une soirée
  // qui court encore à 2 h du matin ne doit pas s'afficher « Terminée ».
  const today = competitionDate(new Date(), c.timezone ?? DEFAULT_TIMEZONE);
  if (c.closed_at || c.ends_on < today) return { label: "Over", tone: "text-muted-foreground" };
  if (c.starts_on > today) {
    const days = Math.round((new Date(c.starts_on).getTime() - Date.now()) / 86400000);
    return { label: days <= 1 ? "Tomorrow" : `In ${days} days`, tone: "text-amber-400" };
  }
  return { label: "Live", tone: "text-primary" };
};

/**
 * Une ligne de la liste.
 *
 * Elle ne disait que le nom et la durée : pour connaître le thème du jour, ou
 * savoir si l'on avait déjà répondu, il fallait ouvrir le défi. Les deux
 * choses qu'on vient chercher le matin sont maintenant sur la carte.
 */
const CompetitionCard = ({
  digest,
  onOpen,
  onRecord,
}: {
  digest: ChallengeDigest;
  onOpen: () => void;
  onRecord?: () => void;
}) => {
  const { competition, theme, dayIndex, hasPosted, needsMe, state } = digest;
  const status = statusOf(competition);
  return (
    <div
      className={`w-full bg-card border rounded-2xl overflow-hidden ${
        needsMe ? "border-primary/50" : "border-border/40"
      }`}
    >
      <motion.button
        whileTap={{ scale: 0.98 }}
        onClick={onOpen}
        className="w-full text-left p-4 flex items-center gap-3"
      >
        <div className="w-11 h-11 rounded-xl gradient-red flex items-center justify-center shrink-0">
          <Trophy size={20} className="text-primary-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-foreground truncate">{competition.name}</p>
          <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground min-w-0">
            <span className={status.tone}>{status.label}</span>
            <span className="flex items-center gap-1">
              <Calendar size={11} />{dayCount(competition)} days
            </span>
            {competition.prize && (
              <span className="flex items-center gap-1 min-w-0">
                <Trophy size={11} className="text-amber-400 shrink-0" />
                <span className="truncate">{competition.prize}</span>
              </span>
            )}
          </div>
        </div>
        <ChevronRight size={18} className="text-muted-foreground shrink-0" />
      </motion.button>

      {/* Le thème du jour, lisible sans ouvrir le défi. */}
      {state === "live" && theme && (
        <div className="px-4 pb-3 -mt-1">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Day {dayIndex} · today's theme
          </p>
          <p className="text-sm font-medium text-foreground leading-snug break-words">{theme}</p>

          {hasPosted ? (
            <p className="mt-2 text-[11px] text-muted-foreground flex items-center gap-1.5">
              <Check size={12} className="text-primary shrink-0" /> You've told yours today
            </p>
          ) : (
            onRecord && (
              <button
                onClick={onRecord}
                className="mt-2 w-full rounded-xl gradient-red text-primary-foreground text-sm font-medium py-2 flex items-center justify-center gap-1.5"
              >
                <Mic size={14} /> Tell yours
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
};

const CompetitionsPage = () => {
  const navigate = useNavigate();
  const { mine, open, loading, join, findByCode } = useCompetitions();
  const { digests } = useChallengeDigest(mine);

  /**
   * Trois listes plutôt qu'une.
   *
   * Un défi qui court, un qui commence dans trois jours et un qui s'est
   * terminé la semaine dernière n'appellent pas la même chose, et les mêler
   * obligeait à lire chaque étiquette pour trier soi-même.
   */
  const live = sortDigests(digests.filter((d) => d.state === "live"));
  const upcoming = sortDigests(digests.filter((d) => d.state === "upcoming"));
  const over = digests.filter((d) => d.state === "over");
  const waiting = live.filter((d) => d.needsMe).length;
  const [code, setCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);

  const joinByCode = async () => {
    if (!code.trim()) return;
    setJoining(true);
    try {
      const found = await findByCode(code);
      if (!found) {
        toast.error("No challenge with that code.");
        return;
      }
      await join(found.id);
      toast.success(`Welcome to "${found.name}"!`);
      setCode("");
      setCodeOpen(false);
      navigate(`/competitions/${found.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not join.");
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-28">
      <header className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border/40"
              style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
        <div className="flex items-center justify-between px-4 py-3 gap-2">
          <h1 className="text-xl font-bold text-foreground min-w-0 truncate">Challenges</h1>
          {/* Rejoindre est aussi fréquent que créer : les deux se tiennent
              désormais côte à côte, au lieu d'obliger à faire défiler tout
              l'écran pour trouver le champ de code. */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => setCodeOpen(true)}
              className="flex items-center gap-1 text-sm font-medium text-primary"
            >
              <Plus size={18} /> Join
            </button>
            <button
              onClick={() => navigate("/competitions/new")}
              className="flex items-center gap-1 text-sm font-medium text-primary"
            >
              <Plus size={18} /> New
            </button>
          </div>
        </div>
      </header>

      <div className="px-4 pt-4 space-y-6">
        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

        {!loading && mine.length === 0 && open.length === 0 && (
          <div className="text-center py-16">
            <Trophy size={40} className="mx-auto text-muted-foreground mb-3" />
            <p className="text-foreground font-medium">No challenges yet</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-xs mx-auto">
              Run a challenge between schools, liven up a wedding or an
              offsite — or join one with a code.
            </p>
            <button
              onClick={() => navigate("/competitions/new")}
              className="mt-5 px-5 py-2.5 rounded-full gradient-red text-primary-foreground font-medium text-sm"
            >
              Create a challenge
            </button>
          </div>
        )}

        {live.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center justify-between gap-2">
              <span className="min-w-0 truncate">Live now</span>
              {/* Le compte de ce qui reste à faire, avant même de lire la
                  liste : c'est la seule question qu'on se pose le matin. */}
              {waiting > 0 && (
                <span className="text-primary normal-case tracking-normal shrink-0">
                  {waiting} waiting for you
                </span>
              )}
            </h2>
            {live.map((d) => (
              <CompetitionCard
                key={d.competition.id}
                digest={d}
                onOpen={() => navigate(`/competitions/${d.competition.id}`)}
                onRecord={d.dayId ? () => navigate(`/record?competitionDay=${d.dayId}`) : undefined}
              />
            ))}
          </section>
        )}

        {upcoming.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Starting soon
            </h2>
            {upcoming.map((d) => (
              <CompetitionCard
                key={d.competition.id}
                digest={d}
                onOpen={() => navigate(`/competitions/${d.competition.id}`)}
              />
            ))}
          </section>
        )}

        {over.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Finished
            </h2>
            {over.map((d) => (
              <CompetitionCard
                key={d.competition.id}
                digest={d}
                onOpen={() => navigate(`/competitions/${d.competition.id}`)}
              />
            ))}
          </section>
        )}

        {open.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
              <Users size={12} /> Open to everyone
            </h2>
            {open.map((c) => (
              <CompetitionCard
                key={c.id}
                digest={{
                  competition: c, state: "upcoming", theme: null, dayId: null,
                  dayIndex: null, hasPosted: false, needsMe: false,
                }}
                onOpen={() => navigate(`/competitions/${c.id}`)}
              />
            ))}
          </section>
        )}

      </div>

      {/*
        Le champ de code, en feuille plutôt qu'en bas de page.

        Il vivait sous les trois listes : rejoindre un défi demandait de faire
        défiler tout l'écran, alors que c'est la première chose qu'on fait
        quand on reçoit un code.
      */}
      <AnimatePresence>
        {codeOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-background/80 backdrop-blur flex items-end sm:items-center justify-center"
            onClick={() => setCodeOpen(false)}
          >
            <motion.div
              initial={{ y: 40 }} animate={{ y: 0 }} exit={{ y: 40 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg bg-card border-t sm:border border-border/40 sm:rounded-2xl p-5 space-y-4"
              style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" }}
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-bold text-foreground flex items-center gap-1.5 min-w-0">
                  <KeyRound size={15} className="shrink-0" />
                  <span className="truncate">Join with a code</span>
                </h2>
                <button onClick={() => setCodeOpen(false)} className="p-1 text-muted-foreground shrink-0">
                  <X size={18} />
                </button>
              </div>

              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="ABC123"
                maxLength={6}
                autoFocus
                className="w-full min-w-0 bg-background border border-border/50 rounded-xl px-4 py-3 text-foreground text-center text-xl tracking-[0.3em] font-mono uppercase placeholder:tracking-normal placeholder:font-sans placeholder:text-base"
              />

              <p className="text-[11px] text-muted-foreground">
                The person who invited you can find the code on the challenge's
                share sheet. An invite link works too.
              </p>

              <button
                onClick={joinByCode}
                disabled={joining || code.length < 4}
                className="w-full rounded-xl gradient-red text-primary-foreground font-medium py-3 disabled:opacity-40"
              >
                {joining ? "Joining…" : "Join"}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <BottomNav />
    </div>
  );
};

export default CompetitionsPage;
