import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Crown, Vote, Lock, Mic } from "lucide-react";
import { toast } from "sonner";
import MiniPlayer from "@/components/MiniPlayer";
import { useCompetitionDayVote } from "@/hooks/useCompetitionDayVote";
import { competitionDate, formatCountdown, msUntilRollover } from "@/lib/competitionClock";
import type { CompetitionDay } from "@/hooks/useCompetition";

/**
 * L'urne du jour : écouter les anecdotes, et en élire une.
 *
 * Une voix par personne et par jour. Le vote est ce qui distingue un défi d'un
 * simple compteur de likes : il demande d'écouter les autres avant de choisir,
 * et c'est précisément ce qu'un défi entre écoles cherche à provoquer.
 *
 * L'urne se scelle à 4 h du matin. Ni minuit — la moitié des gens écoutent
 * encore — ni la fin de la compétition, qui retiendrait les bonus six jours et
 * priverait le classement de la seule chose qui le fait bouger tous les jours.
 */

interface Props {
  competitionId: string | undefined;
  days: CompetitionDay[];
  currentDay: CompetitionDay | null;
  timezone: string;
  isMember: boolean;
  /** Le jour en cours n'accepte des anecdotes que si l'on joue. */
  onRecord?: () => void;
}

const CompetitionDayBallot = ({
  competitionId, days, currentDay, timezone, isMember, onRecord,
}: Props) => {
  const navigate = useNavigate();

  /**
   * Les jours déjà passés, plus celui qui court. Les jours à venir n'ont ni
   * anecdote ni voix : les proposer offrirait des onglets vides.
   *
   * La date se calcule ici et non depuis `currentDay`, qui est nul dès que la
   * compétition est finie : s'appuyer dessus faisait disparaître toute l'urne
   * à la clôture, au moment précis où l'on veut relire qui a gagné chaque jour.
   */
  const openable = useMemo(() => {
    const today = competitionDate(new Date(), timezone);
    return days
      .filter((d) => d.date <= today)
      .sort((a, b) => b.day_index - a.day_index);
  }, [days, timezone]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const day =
    openable.find((d) => d.id === selectedId) ?? currentDay ?? openable[0] ?? null;

  const {
    entries, myVote, totalVotes, isOpen, isSettled, loading, castVote, clearVote,
  } = useCompetitionDayVote(competitionId, day, timezone);

  if (!day) return null;

  const countdown = formatCountdown(msUntilRollover(new Date(), timezone));

  const vote = async (postId: string) => {
    try {
      if (myVote === postId) {
        await clearVote();
        toast("Vote withdrawn");
      } else {
        await castVote(postId);
        toast.success("Vote counted!");
      }
    } catch (err) {
      // Le message de la base est déjà explicite : on ne vote pas pour soi, ni
      // sur une urne scellée.
      toast.error(err instanceof Error ? err.message : "Vote refused.");
    }
  };

  return (
    <section>
      <div className="flex items-center justify-between mb-2 gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5 min-w-0">
          <Vote size={12} className="shrink-0" />
          <span className="truncate">Today's stories</span>
        </h2>
        {isOpen ? (
          <span className="text-[11px] text-muted-foreground shrink-0">
            Results in {countdown}
          </span>
        ) : isSettled ? (
          <span className="text-[11px] text-amber-400 flex items-center gap-1 shrink-0">
            <Lock size={10} /> Counted
          </span>
        ) : null}
      </div>

      {/* Revoir les scrutins passés — un défi se raconte aussi après coup. */}
      {openable.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-2 mb-1 -mx-4 px-4">
          {openable.map((d) => {
            const active = d.id === day.id;
            return (
              <button
                key={d.id}
                onClick={() => setSelectedId(d.id)}
                className={`px-3 py-1 rounded-full text-xs font-medium border shrink-0 ${
                  active
                    ? "border-primary text-primary bg-primary/10"
                    : "border-border/40 text-muted-foreground"
                }`}
              >
                Day {d.day_index}
              </button>
            );
          })}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground mb-2 truncate">{day.theme}</p>

      {loading ? (
        <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
      ) : entries.length === 0 ? (
        <div className="text-center py-8 px-4 rounded-xl border border-dashed border-border/50">
          <p className="text-sm text-foreground font-medium">No stories for this day</p>
          {isOpen && isMember && onRecord && (
            <button
              onClick={onRecord}
              className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-full gradient-red text-primary-foreground text-sm font-medium"
            >
              <Mic size={14} /> Be the first
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry, i) => {
            const chosen = myVote === entry.postId;
            return (
              <motion.div
                key={entry.postId}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className={`flex items-center gap-3 p-3 rounded-xl border ${
                  chosen ? "bg-primary/10 border-primary/50" : "bg-card border-border/40"
                }`}
              >
                <div className="relative shrink-0">
                  {entry.isWinner && (
                    <Crown size={14} className="absolute -top-2 -right-1 text-amber-400 fill-amber-400 z-10" />
                  )}
                  <MiniPlayer url={entry.audioUrl} />
                </div>

                <div className="flex-1 min-w-0">
                  <button
                    onClick={() => navigate(`/post/${entry.postId}`)}
                    className="block w-full text-left"
                  >
                    <p className="text-sm font-medium text-foreground truncate">{entry.title}</p>
                  </button>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {entry.isMine ? "You" : entry.authorName}
                  </p>
                </div>

                <span className="text-[11px] text-amber-400 font-medium tabular-nums shrink-0 flex items-center gap-0.5">
                  <Crown size={10} className="fill-amber-400" />
                  {entry.votes}
                </span>

                {/* On ne vote pas pour soi, ni sur une urne scellée : le bouton
                    disparaît plutôt que d'être proposé puis refusé. */}
                {isOpen && isMember && !entry.isMine && (
                  <button
                    onClick={() => vote(entry.postId)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold shrink-0 ${
                      chosen ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"
                    }`}
                  >
                    {chosen ? "My vote" : "Vote"}
                  </button>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      {entries.length > 0 && (
        <p className="text-[11px] text-muted-foreground mt-2">
          {isSettled
            ? `${totalVotes} vote(s) · the best story took the bonus.`
            : isOpen
            ? `${totalVotes} vote(s) · the bonus lands when votes are counted, in ${countdown}.`
            : `${totalVotes} vote(s).`}
        </p>
      )}
    </section>
  );
};

export default CompetitionDayBallot;
