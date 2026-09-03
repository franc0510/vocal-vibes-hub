/**
 * Quand un défi se termine, et qui il reste à prévenir.
 *
 * Jusqu'ici, un défi ne se terminait JAMAIS : `freezeStandings()` était écrit,
 * testé, et appelé nulle part ; rien n'écrivait `closed_at` ni
 * `final_standings`. Un lot promis n'avait donc pas de vainqueur officiel — le
 * classement continuait de bouger indéfiniment, au gré des likes qui
 * tombaient encore.
 *
 * Ces règles sont pures et vivent ici, à l'écart du script qui les applique :
 * décider « ce défi est-il fini » ne demande aucun réseau, et c'est la partie
 * qu'on ne veut pas se tromper.
 */

import { ballotIsSettled, DEFAULT_TIMEZONE } from "./competitionClock";

export interface ClosableCompetition {
  id: string;
  ends_on: string;
  timezone: string | null;
  closed_at: string | null;
}

/**
 * Ce défi est-il à clôturer maintenant ?
 *
 * Pas « sa date de fin est passée » mais « l'urne de son dernier jour est
 * dépouillée » — c'est-à-dire 4 h le lendemain, dans le fuseau de
 * l'organisateur. Clore plus tôt priverait le dernier jour de ses votes, donc
 * de son bonus, et pourrait désigner le mauvais vainqueur.
 *
 * Un défi déjà clos ne se reclôt pas : son classement est gelé, et le
 * recalculer laisserait un like posté depuis changer un résultat annoncé.
 */
export function shouldClose(competition: ClosableCompetition, now: Date): boolean {
  if (competition.closed_at) return false;
  return ballotIsSettled(
    competition.ends_on,
    now,
    competition.timezone ?? DEFAULT_TIMEZONE
  );
}

export interface SettleableDay {
  id: string;
  date: string;
  competition_id: string;
}

/**
 * Les jours dont l'urne est scellée et dont personne n'a encore été prévenu.
 *
 * `announced` est le registre des annonces déjà faites : sans lui, chaque
 * passage de la tâche planifiée renotifierait les mêmes gagnants — une heure
 * après l'autre, indéfiniment.
 */
export function daysToSettle(
  days: SettleableDay[],
  announcedDayIds: Set<string>,
  timezoneOf: (competitionId: string) => string,
  now: Date
): SettleableDay[] {
  return days.filter(
    (d) =>
      !announcedDayIds.has(d.id) &&
      ballotIsSettled(d.date, now, timezoneOf(d.competition_id))
  );
}

/**
 * Le message annonçant un jour remporté.
 *
 * Nommer le thème plutôt que le numéro du jour : « Day 3 » ne dit rien, « Ton
 * pire date » rappelle immédiatement ce qu'on a raconté.
 */
export function dayWonMessage(theme: string, bonus: number): string {
  return `Your story won "${theme}" — +${bonus} points.`;
}

/** Le message de fin de défi, pour le vainqueur et pour les autres. */
export function resultMessage(
  competitionName: string,
  won: boolean,
  winnerName: string | null
): string {
  if (won) return `You won "${competitionName}"!`;
  if (winnerName) return `"${competitionName}" is over — ${winnerName} won.`;
  // Une égalité au sommet ne désigne personne : mieux vaut le dire que
  // d'inventer un gagnant choisi par l'ordre d'arrivée des lignes.
  return `"${competitionName}" is over — it ended in a tie.`;
}
