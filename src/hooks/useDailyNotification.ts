import { useEffect } from "react";
import { LocalNotifications } from "@capacitor/local-notifications";
import { Capacitor } from "@capacitor/core";

const NOTIFICATION_ID = 1800;

export const useDailyNotification = () => {
  useEffect(() => {
    const setup = async () => {
      // Only run on native platforms or browsers that support notifications
      if (Capacitor.isNativePlatform()) {
        await setupNativeNotification();
      } else {
        await setupWebNotification();
      }
    };
    setup();
  }, []);
};

async function setupNativeNotification() {
  const { display } = await LocalNotifications.requestPermissions();
  if (display !== "granted") return;

  // Cancel existing to avoid duplicates
  try {
    await LocalNotifications.cancel({ notifications: [{ id: NOTIFICATION_ID }] });
  } catch {}

  // Schedule daily at 18:00
  const now = new Date();
  const next18h = new Date();
  next18h.setHours(18, 0, 0, 0);
  if (now >= next18h) next18h.setDate(next18h.getDate() + 1);

  await LocalNotifications.schedule({
    notifications: [
      {
        id: NOTIFICATION_ID,
        title: "🎙️ C'est l'heure de ton vocal !",
        body: "Raconte ton anecdote du jour sur VocMe avant qu'il ne soit trop tard !",
        schedule: {
          on: { hour: 18, minute: 0 },
          every: "day",
          allowWhileIdle: true,
        },
        sound: "default",
        smallIcon: "ic_stat_icon_config_sample",
        largeIcon: "splash",
      },
    ],
  });
}

async function setupWebNotification() {
  if (!("Notification" in window)) return;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return;

  // For web, schedule a check every minute to fire at 18:00
  const checkAndNotify = () => {
    const now = new Date();
    if (now.getHours() === 18 && now.getMinutes() === 0) {
      new Notification("🎙️ C'est l'heure de ton vocal !", {
        body: "Raconte ton anecdote du jour sur VocMe !",
        icon: "/favicon.ico",
      });
    }
  };

  // Check every 30 seconds
  setInterval(checkAndNotify, 30000);
}
