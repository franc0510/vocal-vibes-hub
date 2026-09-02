import { useCallback, useEffect } from "react";
import { LocalNotifications } from "@capacitor/local-notifications";
import { Capacitor } from "@capacitor/core";
import { db } from "@/integrations/supabase/untyped";
import { useAuth } from "@/contexts/AuthContext";
import {
  competitionDate,
  instantAt,
  DEFAULT_TIMEZONE,
} from "@/lib/competitionClock";

/**
 * « Voici le thème du jour, à toi de jouer » — chaque matin, 9 h.
 *
 * Un défi ne vit que si l'on y pense le matin. Sans rappel, le premier jour
 * est plein et les six suivants se vident : personne n'ouvre l'application
 * pour vérifier s'il y a un nouveau thème.
 *
 * Ce sont des notifications LOCALES, planifiées d'avance sur l'appareil, comme
 * le rappel de 18 h. Ce projet n'a ni push, ni cron, ni serveur qui tourne à
 * heure fixe : la seule chose qui arrive à coup sûr un matin donné est ce
 * qu'on a confié d'avance à l'ordonnanceur du téléphone. Ça tombe bien — tous
 * les thèmes existent dès la création du défi, donc il n'y a rien à attendre
 * pour écrire le texte.
 *
 * 9 h, et non l'heure de bascule de 4 h : le thème est en place depuis cinq
 * heures, et personne ne veut être réveillé pour une anecdote.
 */

/** L'heure du rappel, dans le fuseau de la compétition. */
const REMINDER_HOUR = 9;

/**
 * Bande d'identifiants réservée.
 *
 * 1800 est le rappel quotidien, 1900 celui du dimanche, 500 000+ les
 * illustrations. Empiéter sur l'une d'elles ferait qu'un défi annulerait
 * silencieusement le rappel du soir.
 */
const ID_BASE = 700_000;

/**
 * Combien de jours on planifie d'avance.
 *
 * Assez pour couvrir un défi entier sans jamais rouvrir l'application, pas
 * assez pour saturer la file de l'OS — iOS ne garde que 64 notifications en
 * attente, et ce hook n'est pas seul à en poser.
 */
const HORIZON_DAYS = 14;

function notificationIdFor(dayId: string): number {
  let hash = 0;
  for (let i = 0; i < dayId.length; i++) {
    hash = (hash * 31 + dayId.charCodeAt(i)) | 0;
  }
  return ID_BASE + (Math.abs(hash) % 100_000);
}

interface DayRow {
  id: string;
  day_index: number;
  theme: string;
  date: string;
  competition_id: string;
  competitions?: { name: string; timezone: string | null } | null;
}

export const useCompetitionDayNotifications = () => {
  const { user } = useAuth();

  const schedule = useCallback(async () => {
    if (!user || !Capacitor.isNativePlatform()) return;

    const { display } = await LocalNotifications.checkPermissions();
    if (display !== "granted") {
      const asked = await LocalNotifications.requestPermissions();
      if (asked.display !== "granted") return;
    }

    const { data: memberships } = await db
      .from("competition_members")
      .select("competition_id")
      .eq("user_id", user.id);
    const ids = (memberships ?? []).map((m: { competition_id: string }) => m.competition_id);
    if (ids.length === 0) return;

    // Une fenêtre large en dates UTC : le tri fin se fait ensuite, jour par
    // jour, dans le fuseau de chaque compétition.
    const now = new Date();
    const from = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
    const to = new Date(now.getTime() + HORIZON_DAYS * 86_400_000).toISOString().slice(0, 10);

    const { data } = await db
      .from("competition_days")
      .select("id, day_index, theme, date, competition_id, competitions(name, timezone)")
      .in("competition_id", ids)
      .gte("date", from)
      .lte("date", to)
      .order("date");

    const rows = (data ?? []) as DayRow[];
    const pending: {
      id: number;
      title: string;
      body: string;
      schedule: { at: Date; allowWhileIdle: boolean };
      extra: { competitionId: string; dayId: string };
      sound: string;
      smallIcon: string;
      largeIcon: string;
    }[] = [];

    for (const day of rows) {
      const timezone = day.competitions?.timezone ?? DEFAULT_TIMEZONE;
      const at = instantAt(day.date, REMINDER_HOUR, timezone);
      // Un rappel dont l'heure est passée n'a plus rien à annoncer : le jour
      // court déjà, ou il est fini. L'OS refuserait de toute façon une date
      // antérieure, en silence.
      if (at.getTime() <= now.getTime()) continue;

      pending.push({
        id: notificationIdFor(day.id),
        title: day.competitions?.name ?? "Challenge",
        // Le thème EST le message. « Tu as une notification » ne fait ouvrir
        // personne ; « Your worst date » fait ouvrir tout le monde.
        body: `Day ${day.day_index} — ${day.theme}. Record yours today!`,
        schedule: { at, allowWhileIdle: true },
        extra: { competitionId: day.competition_id, dayId: day.id },
        sound: "default",
        smallIcon: "ic_stat_icon_config_sample",
        largeIcon: "splash",
      });
    }

    /**
     * On retire d'abord tout ce qui vient de nous.
     *
     * Quitter un défi, un thème réécrit, une compétition supprimée : sans ce
     * nettoyage, l'ancienne notification reste dans la file de l'OS et arrive
     * quand même — en annonçant un thème qui n'existe plus. Replanifier ne
     * suffit pas, seuls les identifiants encore présents seraient écrasés.
     */
    try {
      const { notifications } = await LocalNotifications.getPending();
      const ours = notifications
        .filter((n) => n.id >= ID_BASE && n.id < ID_BASE + 100_000)
        .map((n) => ({ id: n.id }));
      if (ours.length > 0) await LocalNotifications.cancel({ notifications: ours });
    } catch {
      // getPending n'est pas disponible partout ; mieux vaut une notification
      // en double qu'aucune.
    }

    if (pending.length > 0) {
      await LocalNotifications.schedule({ notifications: pending });
    }
  }, [user]);

  useEffect(() => {
    schedule();
  }, [schedule]);

  /**
   * Le jour où la compétition bascule, on replanifie.
   *
   * Sans ça, une application laissée ouverte plusieurs jours garderait la file
   * qu'elle avait posée au premier lancement — correcte, mais qui ne verrait
   * jamais un thème corrigé entre-temps par l'organisateur.
   */
  useEffect(() => {
    if (!user) return;
    let last = competitionDate(new Date(), DEFAULT_TIMEZONE);
    const id = window.setInterval(() => {
      const today = competitionDate(new Date(), DEFAULT_TIMEZONE);
      if (today !== last) {
        last = today;
        schedule();
      }
    }, 15 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [user, schedule]);
};
