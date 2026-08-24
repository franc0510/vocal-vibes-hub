import { useEffect, useRef } from "react";
import { LocalNotifications } from "@capacitor/local-notifications";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Tells the author when their anecdote has finished being illustrated.
 *
 * Generating a story takes about a minute. The point of this is that the user
 * does not have to spend that minute watching a spinner: they publish, leave,
 * and get called back when there is something to see.
 *
 * Notification ids are derived from the post id so a second finish for the
 * same post replaces its own notification instead of stacking.
 */

/** Keeps generated ids clear of the fixed ones used by the weekly reminders. */
const ID_BASE = 500_000;

function notificationIdFor(postId: string): number {
  let hash = 0;
  for (let i = 0; i < postId.length; i++) {
    hash = (hash * 31 + postId.charCodeAt(i)) | 0;
  }
  return ID_BASE + (Math.abs(hash) % 100_000);
}

export const useStoryIllustrationNotifications = () => {
  const { user } = useAuth();
  // Realtime can replay a row; without this the same finish notifies twice.
  const announced = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;

    const notify = async (postId: string, title: string, ready: boolean) => {
      if (announced.current.has(postId)) return;
      announced.current.add(postId);

      if (!Capacitor.isNativePlatform()) return;
      try {
        const { display } = await LocalNotifications.checkPermissions();
        if (display !== "granted") {
          const asked = await LocalNotifications.requestPermissions();
          if (asked.display !== "granted") return;
        }
        await LocalNotifications.schedule({
          notifications: [
            {
              id: notificationIdFor(postId),
              title: ready ? "Ton anecdote est illustrée ✨" : "L'illustration a échoué",
              body: ready
                ? `« ${title} » est prête à être regardée.`
                : `« ${title} » n'a pas pu être illustrée. Tu peux réessayer.`,
              sound: "default",
              extra: { postId },
            },
          ],
        });
      } catch (err) {
        // A refused or unavailable notification must never break the app.
        console.warn("Could not schedule illustration notification:", err);
      }
    };

    const channel = supabase
      .channel(`illustration_done:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "voice_posts",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new as {
            id?: string;
            title?: string;
            illustration_status?: string;
          };
          const previous = payload.old as { illustration_status?: string };
          if (!row?.id || row.illustration_status === previous?.illustration_status) return;

          if (row.illustration_status === "ready") notify(row.id, row.title ?? "", true);
          if (row.illustration_status === "failed") notify(row.id, row.title ?? "", false);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);
};
