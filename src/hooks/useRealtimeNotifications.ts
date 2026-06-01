import { useEffect } from "react";
import { LocalNotifications } from "@capacitor/local-notifications";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * App-wide realtime → local notification bridge.
 *
 * Subscribes to the `notifications` table for the current user and fires a
 * device notification (banner) for each new row, no matter which page is
 * currently open. This is mounted once at the app root.
 *
 * NOTE: This delivers notifications while the app process is alive
 * (foreground or recently backgrounded). For notifications delivered when the
 * app is fully closed you need true remote push (APNs) — see usePushRegistration.
 */
export const useRealtimeNotifications = () => {
  const { user } = useAuth();

  // Make sure we have permission to display notifications
  useEffect(() => {
    const ask = async () => {
      if (Capacitor.isNativePlatform()) {
        await LocalNotifications.requestPermissions();
      } else if ("Notification" in window && Notification.permission === "default") {
        try { await Notification.requestPermission(); } catch {}
      }
    };
    ask();
  }, []);

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("global_notifications_bridge")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        async (payload) => {
          const notif = payload.new as any;

          const typeText: Record<string, string> = {
            like: "liked your voice",
            comment: "commented on your voice",
            share: "shared your voice",
            follow: "started following you",
            group_added: "added you to a group",
            group_post: "posted a VocMe in a group",
            friend_post: "added a new VocMe",
            weekly_winner: "Your VocMe was crowned VocMe of the Week!",
          };

          // Weekly winner is a self-notification — celebratory, no actor name
          if (notif.type === "weekly_winner") {
            await fire("VocMe of the Week 🏆", "👑 Congrats! Your VocMe was crowned VocMe of the Week!");
            return;
          }

          const body = typeText[notif.type] || "New notification";

          // Resolve actor name for a nicer message
          let actorName = "Someone";
          if (notif.actor_id) {
            const { data: actorProfile } = await supabase
              .from("profiles").select("display_name").eq("id", notif.actor_id).single();
            if (actorProfile?.display_name) actorName = actorProfile.display_name;
          }

          let pushBody = `${actorName} ${body}`;
          if ((notif.type === "group_added" || notif.type === "group_post") && notif.group_id) {
            const { data: groupData } = await (supabase as any)
              .from("groups").select("name").eq("id", notif.group_id).single();
            const groupName = groupData?.name || "a group";
            pushBody = notif.type === "group_added"
              ? `${actorName} added you to the VocMe group "${groupName}"`
              : `${actorName} added a VocMe in the group "${groupName}"`;
          }
          if (notif.type === "friend_post" && notif.post_id) {
            const { data: postData } = await supabase
              .from("voice_posts").select("title").eq("id", notif.post_id).single();
            pushBody = `${actorName} added a new VocMe "${postData?.title || ""}"`;
          }

          await fire("VocMe", pushBody);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);
};

async function fire(title: string, body: string) {
  if (Capacitor.isNativePlatform()) {
    try {
      await LocalNotifications.schedule({
        notifications: [{
          id: Math.floor(Math.random() * 1_000_000),
          title,
          body,
          sound: "default",
        }],
      });
    } catch {
      /* ignore */
    }
  } else if ("Notification" in window && Notification.permission === "granted") {
    new window.Notification(title, { body, icon: "/favicon.ico" });
  }
}
