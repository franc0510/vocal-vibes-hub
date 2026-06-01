import { useEffect } from "react";
import { LocalNotifications } from "@capacitor/local-notifications";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWeeklyVocme, mondayOf, toDateStr } from "@/hooks/useWeeklyVocme";

const SUNDAY_REMINDER_ID = 1900;

/**
 * Handles the two weekly notifications:
 *  1. A recurring Sunday-evening reminder that voting is about to close.
 *  2. A personal "You are the VocMe of the Week!" notification for the winner.
 */
export const useWeeklyNotifications = () => {
  const { user } = useAuth();
  const { winnerPostId } = useWeeklyVocme();

  // --- 1) Sunday "voting ends soon" reminder ---
  useEffect(() => {
    const setup = async () => {
      if (Capacitor.isNativePlatform()) {
        const { display } = await LocalNotifications.requestPermissions();
        if (display !== "granted") return;
        try {
          await LocalNotifications.cancel({ notifications: [{ id: SUNDAY_REMINDER_ID }] });
        } catch {}
        await LocalNotifications.schedule({
          notifications: [
            {
              id: SUNDAY_REMINDER_ID,
              title: "Last call to vote! 🗳️",
              body: "Voting for the VocMe of the Week closes tonight — cast your vote!",
              schedule: {
                // Weekday 1 = Sunday in Capacitor's schedule API
                on: { weekday: 1, hour: 18, minute: 0 },
                allowWhileIdle: true,
              },
              sound: "default",
              smallIcon: "ic_stat_icon_config_sample",
              largeIcon: "splash",
            },
          ],
        });
      } else if ("Notification" in window) {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") return;
        const check = () => {
          const now = new Date();
          if (now.getDay() === 0 && now.getHours() === 18 && now.getMinutes() === 0) {
            new Notification("Last call to vote! 🗳️", {
              body: "Voting for the VocMe of the Week closes tonight — cast your vote!",
              icon: "/favicon.ico",
            });
          }
        };
        const id = window.setInterval(check, 30000);
        return () => window.clearInterval(id);
      }
    };
    const cleanup = setup();
    return () => {
      if (typeof cleanup === "function") (cleanup as () => void)();
    };
  }, []);

  // --- 2) "You won VocMe of the Week" personal notification ---
  useEffect(() => {
    if (!user || !winnerPostId) return;

    const notifyIfWinner = async () => {
      // The crowned week = two Mondays ago (matches useWeeklyVocme logic)
      const currentWeekStart = mondayOf(new Date());
      const crownedWeek = new Date(currentWeekStart);
      crownedWeek.setDate(crownedWeek.getDate() - 14);
      const crownedWeekStart = toDateStr(crownedWeek);

      // Guard: only fire once per crowned week on this device
      const flagKey = `vocme_winner_notified_${crownedWeekStart}`;
      if (localStorage.getItem(flagKey)) return;

      // Is the winning post mine?
      const { data: post } = await supabase
        .from("voice_posts")
        .select("id, user_id, title")
        .eq("id", winnerPostId)
        .maybeSingle();
      if (!post || post.user_id !== user.id) return;

      // Avoid duplicate DB rows if it already exists
      const { data: existing } = await supabase
        .from("notifications")
        .select("id")
        .eq("user_id", user.id)
        .eq("type", "weekly_winner")
        .eq("post_id", winnerPostId)
        .limit(1);

      if (!existing || existing.length === 0) {
        await supabase.from("notifications").insert({
          user_id: user.id,
          actor_id: user.id,
          type: "weekly_winner",
          post_id: winnerPostId,
        } as any);
      }

      localStorage.setItem(flagKey, "1");

      // Fire a celebratory push
      const body = "👑 Congrats! Your VocMe was crowned VocMe of the Week!";
      if (Capacitor.isNativePlatform()) {
        try {
          await LocalNotifications.schedule({
            notifications: [{
              id: Math.floor(Math.random() * 100000),
              title: "VocMe of the Week 🏆",
              body,
              sound: "default",
            }],
          });
        } catch {}
      } else if ("Notification" in window && Notification.permission === "granted") {
        new window.Notification("VocMe of the Week 🏆", { body, icon: "/favicon.ico" });
      }
    };

    notifyIfWinner();
  }, [user?.id, winnerPostId]);
};
