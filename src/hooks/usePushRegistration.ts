import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { useNavigate } from "react-router-dom";
import { db } from "@/integrations/supabase/untyped";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Le hook que le code promettait depuis toujours.
 *
 * `useRealtimeNotifications` renvoyait à un `usePushRegistration` qui n'a
 * jamais existé — une promesse en commentaire. Sans lui, TOUTES les
 * notifications de cette application étaient locales : déclenchées par du
 * JavaScript, donc seulement si l'application tournait. Un like reçu pendant
 * qu'on dort n'arrivait jamais ; la ligne restait en base, visible plus tard
 * dans le panneau, mais aucune bannière ne partait.
 *
 * Ici on demande à iOS un jeton d'appareil, on le confie à la base, et le
 * serveur peut enfin parler à un téléphone dont l'application est fermée.
 */

export const usePushRegistration = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user || !Capacitor.isNativePlatform()) return;

    let disposed = false;
    const handles: { remove: () => void }[] = [];

    const register = async () => {
      // On ne redemande pas une permission déjà refusée : iOS ne réaffiche
      // plus la question, et insister ne fait que retarder le démarrage.
      let status = await PushNotifications.checkPermissions();
      if (status.receive === "prompt" || status.receive === "prompt-with-rationale") {
        status = await PushNotifications.requestPermissions();
      }
      if (status.receive !== "granted" || disposed) return;

      handles.push(
        await PushNotifications.addListener("registration", async (token) => {
          // Le jeton est confié à une fonction, pas à un INSERT : le même
          // téléphone peut servir deux comptes l'un après l'autre, et la
          // fonction transfère la propriété au lieu d'échouer — sans quoi les
          // notifications du nouveau compte partiraient vers l'ancien.
          await db.rpc("register_device_token", {
            device_token: token.value,
            device_platform: Capacitor.getPlatform(),
          });
        })
      );

      handles.push(
        await PushNotifications.addListener("registrationError", (err) => {
          // Presque toujours la même cause : la capacité Push Notifications
          // n'est pas cochée dans Xcode, ou l'entitlement manque au build.
          console.error("📵 Enregistrement push refusé par iOS :", err);
        })
      );

      /**
       * Le tap sur une notification distante.
       *
       * Mêmes priorités que pour les notifications locales
       * (`useRealtimeNotifications`) : le jour d'abord, puis le défi, puis
       * l'anecdote, puis l'auteur. Deux chemins qui divergeraient ouvriraient
       * deux écrans différents pour la même notification.
       */
      handles.push(
        await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
          const extra = action.notification.data as {
            postId?: string; actorId?: string; competitionId?: string; dayId?: string;
          };
          if (extra?.dayId) navigate(`/record?competitionDay=${extra.dayId}`);
          else if (extra?.competitionId) navigate(`/competitions/${extra.competitionId}`);
          else if (extra?.postId) navigate(`/post/${extra.postId}`);
          else if (extra?.actorId) navigate(`/user/${extra.actorId}`);
        })
      );

      await PushNotifications.register();
    };

    register().catch((err) => console.error("📵 Push indisponible :", err));

    return () => {
      disposed = true;
      handles.forEach((h) => h.remove());
    };
  }, [user, navigate]);
};
