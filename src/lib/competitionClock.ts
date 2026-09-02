/**
 * La pendule d'une compétition.
 *
 * Une journée de défi ne commence pas à minuit : elle bascule à 4 h du matin,
 * dans le fuseau de l'organisateur. Trois raisons, et aucune n'est cosmétique.
 *
 *  1. Le dépouillement se fait quand tout le monde dort. À minuit pile, la
 *     moitié des gens sont encore en train d'écouter et de voter ; proclamer
 *     un gagnant sous leurs yeux revient à fermer l'urne pendant le vote.
 *  2. Celui qui publie à 00 h 30 compte encore pour la soirée qu'il raconte,
 *     pas pour le thème du lendemain qu'il n'a pas lu.
 *  3. Le classement bouge chaque matin, à heure fixe. C'est ce qui fait
 *     rouvrir l'application — pas un total qui glisse en continu.
 *
 * Ce module est le jumeau de `public.competition_today()` et de la clause de
 * dépouillement de la vue `competition_player_scores`. Les deux doivent dire
 * la même chose : la base arbitre, celui-ci évite de proposer un bouton que le
 * serveur refusera.
 */

/** L'heure de bascule. Une constante, pas un réglage : la changer par
 *  compétition rendrait « le jour J » indéfinissable dans une notification. */
export const ROLLOVER_HOUR = 4;

/** Le fuseau retenu quand une compétition n'en déclare pas — celui du schéma. */
export const DEFAULT_TIMEZONE = "Europe/Paris";

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/**
 * L'heure murale dans un fuseau donné.
 *
 * `Intl` plutôt qu'un décalage en heures : un décalage fixe se trompe deux
 * nuits par an, et ces deux nuits-là sont précisément celles où un classement
 * bascule sans que personne ne comprenne pourquoi.
 *
 * Un fuseau inconnu ferait lever `Intl` ; on retombe alors sur UTC plutôt que
 * de faire tomber l'écran, une compétition mal configurée devant rester
 * lisible.
 */
function wallClock(instant: Date, timezone: string): WallClock {
  const format = (tz: string) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(instant);

  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = format(timezone || DEFAULT_TIMEZONE);
  } catch {
    parts = format("UTC");
  }

  const read = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");

  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
    second: read("second"),
  };
}

/** Une date civile en `YYYY-MM-DD`, sans passer par un fuseau. */
const isoDate = (utcMs: number): string =>
  new Date(utcMs).toISOString().slice(0, 10);

/**
 * La date de compétition en cours.
 *
 * Remplace les `new Date().toISOString().slice(0, 10)` semés dans les hooks,
 * qui rendaient la date **UTC** : à 1 h du matin à Paris en été, ils
 * annonçaient déjà la veille et le thème du jour sautait.
 */
export function competitionDate(
  now: Date,
  timezone: string = DEFAULT_TIMEZONE,
  rolloverHour: number = ROLLOVER_HOUR
): string {
  const local = wallClock(now, timezone);
  // Arithmétique calendaire pure, à l'écart des fuseaux : reculer d'un jour
  // sur un couple (année, mois, jour) ne peut pas tomber dans une heure qui
  // n'existe pas.
  const midnight = Date.UTC(local.year, local.month - 1, local.day);
  const shifted = local.hour < rolloverHour ? midnight - 86_400_000 : midnight;
  return isoDate(shifted);
}

/**
 * Le scrutin de ce jour est-il dépouillé ?
 *
 * Vrai dès que la compétition est passée à un jour ultérieur, c'est-à-dire à
 * partir de 4 h le lendemain. L'urne est alors scellée : sans ça, un bonus
 * déjà porté au classement pourrait changer de main.
 */
export function ballotIsSettled(
  dayDate: string,
  now: Date,
  timezone: string = DEFAULT_TIMEZONE,
  rolloverHour: number = ROLLOVER_HOUR
): boolean {
  return dayDate < competitionDate(now, timezone, rolloverHour);
}

/** Le jour est-il celui qui court — donc ouvert au vote ? */
export function ballotIsOpen(
  dayDate: string,
  now: Date,
  timezone: string = DEFAULT_TIMEZONE,
  rolloverHour: number = ROLLOVER_HOUR
): boolean {
  return dayDate === competitionDate(now, timezone, rolloverHour);
}

/**
 * Combien de millisecondes avant le prochain dépouillement.
 *
 * Calculé en remontant de l'heure murale plutôt qu'en visant un instant
 * absolu : la nuit du changement d'heure, « dans 3 h 12 » doit rester ce que
 * l'horloge du téléphone affichera, pas ce qu'un calcul en UTC croit.
 */
export function msUntilRollover(
  now: Date,
  timezone: string = DEFAULT_TIMEZONE,
  rolloverHour: number = ROLLOVER_HOUR
): number {
  const local = wallClock(now, timezone);
  const secondsOfDay = local.hour * 3600 + local.minute * 60 + local.second;
  const rolloverSeconds = rolloverHour * 3600;
  const remaining =
    secondsOfDay < rolloverSeconds
      ? rolloverSeconds - secondsOfDay
      : rolloverSeconds + 86_400 - secondsOfDay;
  return remaining * 1000;
}

/**
 * « 3 h 12 », « 47 min ». Pour la ligne qui annonce le dépouillement.
 *
 * Les secondes ne sont jamais affichées : un compte à rebours à la seconde
 * transforme une information en pression, pour une échéance qui se joue à
 * l'heure près.
 */
export function formatCountdown(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${String(rest).padStart(2, "0")}`;
}

/**
 * L'instant absolu où il sera `hour`:00 le jour `dayDate`, dans `timezone`.
 *
 * L'inverse de `wallClock` : on cherche le point du temps dont l'heure murale
 * vaut ce qu'on vise. C'est ce dont une notification planifiée a besoin — l'OS
 * veut un instant, l'organisateur pense en heure locale, et entre les deux il y
 * a un décalage qui change deux fois par an.
 *
 * On part de l'instant naïf, on regarde quelle heure il donne réellement dans
 * le fuseau, et on corrige de l'écart. Une seule passe suffit : le décalage
 * d'un fuseau ne varie que d'une heure, et la correction ne peut pas nous
 * faire changer de régime pour une heure aussi éloignée des bascules.
 */
export function instantAt(
  dayDate: string,
  hour: number,
  timezone: string = DEFAULT_TIMEZONE
): Date {
  const [year, month, day] = dayDate.split("-").map(Number);
  const naive = Date.UTC(year, month - 1, day, hour, 0, 0);

  const seen = wallClock(new Date(naive), timezone);
  const seenMs = Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute, seen.second);
  const targetMs = Date.UTC(year, month - 1, day, hour, 0, 0);

  return new Date(naive - (seenMs - targetMs));
}

/**
 * Le thème de ce jour est-il révélé ?
 *
 * Un joueur découvre le thème le matin même : c'est ce qui fait rouvrir
 * l'application, et ce qui empêche de préparer six anecdotes le premier soir.
 * Les jours passés restent lisibles — leurs anecdotes sont déjà dans l'urne,
 * sous leur thème, et les masquer créerait une incohérence à l'écran.
 *
 * L'organisateur, lui, voit tout : c'est lui qui écrit le programme.
 */
export function themeIsRevealed(dayDate: string, today: string): boolean {
  return dayDate <= today;
}
