import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import {
  signAuthToken,
  sendToDevice,
  type ApnsCredentials,
  type PushPayload,
} from "../_shared/apns.ts";

/**
 * Fait sortir une notification du téléphone.
 *
 * Jusqu'ici toutes les notifications de cette application étaient LOCALES :
 * déclenchées par du JavaScript, donc seulement si l'application tournait. Un
 * like reçu pendant qu'on dort n'arrivait jamais. Cette fonction est appelée
 * par la base à chaque ligne insérée dans `notifications`, et envoie à APNs.
 *
 * Elle ne compose pas le texte à partir de rien : elle lit la ligne, résout le
 * nom de l'acteur ou du défi, et construit la même phrase que celle affichée
 * dans l'application — pour qu'une notification et le panneau ne se
 * contredisent jamais.
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const APNS_KEY_ID = Deno.env.get("APNS_KEY_ID");
const APNS_TEAM_ID = Deno.env.get("APNS_TEAM_ID");
const APNS_PRIVATE_KEY = Deno.env.get("APNS_PRIVATE_KEY");
const APNS_BUNDLE_ID = Deno.env.get("APNS_BUNDLE_ID") ?? "com.vocme.app";
const APNS_SANDBOX = Deno.env.get("APNS_SANDBOX") === "true";

if (!SUPABASE_URL) throw new Error("Missing SUPABASE_URL");
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
if (!APNS_KEY_ID) throw new Error("Missing APNS_KEY_ID");
if (!APNS_TEAM_ID) throw new Error("Missing APNS_TEAM_ID");
if (!APNS_PRIVATE_KEY) throw new Error("Missing APNS_PRIVATE_KEY");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const credentials: ApnsCredentials = {
  keyId: APNS_KEY_ID,
  teamId: APNS_TEAM_ID,
  privateKeyPem: APNS_PRIVATE_KEY,
  bundleId: APNS_BUNDLE_ID,
  sandbox: APNS_SANDBOX,
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

/**
 * Le jeton d'autorisation, gardé en mémoire.
 *
 * Apple refuse un jeton de plus d'une heure ET limite le rythme auquel on peut
 * en créer : en signer un par notification ferait rejeter les envois d'une
 * soirée animée. On le renouvelle à cinquante minutes.
 */
let cachedAuth: { token: string; at: number } | null = null;
async function authToken(): Promise<string> {
  const now = Date.now();
  if (cachedAuth && now - cachedAuth.at < 50 * 60 * 1000) return cachedAuth.token;
  const token = await signAuthToken(credentials);
  cachedAuth = { token, at: now };
  return token;
}

interface NotificationRow {
  id: string;
  user_id: string;
  actor_id: string | null;
  type: string;
  post_id: string | null;
  group_id: string | null;
  competition_id: string | null;
}

/** Le texte, calqué sur celui de l'application. */
async function compose(notif: NotificationRow): Promise<PushPayload> {
  const extra: Record<string, string> = {};
  if (notif.post_id) extra.postId = notif.post_id;
  if (notif.actor_id) extra.actorId = notif.actor_id;
  if (notif.competition_id) extra.competitionId = notif.competition_id;

  let actor = "Someone";
  if (notif.actor_id) {
    const { data } = await supabase
      .from("profiles").select("display_name").eq("id", notif.actor_id).maybeSingle();
    actor = data?.display_name || "Someone";
  }

  let challenge = "your challenge";
  if (notif.competition_id) {
    const { data } = await supabase
      .from("competitions").select("name").eq("id", notif.competition_id).maybeSingle();
    challenge = data?.name || challenge;
  }

  switch (notif.type) {
    case "like": return { title: "VocMe", body: `${actor} liked your voice`, extra };
    case "comment": return { title: "VocMe", body: `${actor} commented on your voice`, extra };
    case "share": return { title: "VocMe", body: `${actor} shared your voice`, extra };
    case "follow": return { title: "VocMe", body: `${actor} started following you`, extra };
    case "group_added": return { title: "VocMe", body: `${actor} added you to a group`, extra };
    case "group_post": return { title: "VocMe", body: `${actor} posted a VocMe in a group`, extra };
    case "friend_post": return { title: "VocMe", body: `${actor} added a new VocMe`, extra };
    case "weekly_winner":
      return { title: "VocMe of the Week", body: "Your VocMe was crowned VocMe of the Week!", extra };
    case "competition_invite":
      return { title: challenge, body: `${actor} invited you to a challenge`, extra };
    case "competition_day":
      return { title: challenge, body: "New theme of the day — record yours!", extra };
    case "competition_day_won":
      return { title: challenge, body: "Your story won the day!", extra };
    case "competition_result":
      return { title: challenge, body: "The challenge results are in!", extra };
    default:
      return { title: "VocMe", body: "New notification", extra };
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let notificationId: string | undefined;
  try {
    ({ notification_id: notificationId } = await req.json());
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (!notificationId) return json({ error: "notification_id is required" }, 400);

  const { data: notif, error } = await supabase
    .from("notifications")
    .select("id, user_id, actor_id, type, post_id, group_id, competition_id")
    .eq("id", notificationId)
    .maybeSingle();
  if (error) return json({ error: error.message }, 500);
  if (!notif) return json({ error: "notification not found" }, 404);

  // On n'envoie qu'aux appareils vivants : un jeton révoqué a déjà été refusé
  // par Apple, le réessayer coûte une requête pour rien.
  const { data: devices } = await supabase
    .from("device_tokens")
    .select("token")
    .eq("user_id", (notif as NotificationRow).user_id)
    .is("revoked_at", null);

  if (!devices || devices.length === 0) {
    // Ce n'est pas une erreur : quelqu'un peut n'avoir jamais ouvert
    // l'application sur un téléphone, ou avoir refusé les notifications.
    return json({ sent: 0, reason: "no device" });
  }

  const payload = await compose(notif as NotificationRow);
  const jwt = await authToken();
  const results = await Promise.all(
    devices.map((d: { token: string }) => sendToDevice(d.token, payload, credentials, jwt))
  );

  // Les appareils disparus sont marqués, pas supprimés : garder la trace
  // permet de comprendre plus tard pourquoi quelqu'un ne reçoit plus rien.
  const gone = results.filter((r) => r.gone).map((r) => r.token);
  if (gone.length > 0) {
    await supabase
      .from("device_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .in("token", gone);
  }

  const failed = results.filter((r) => !r.ok && !r.gone);
  if (failed.length > 0) {
    console.error("APNs a refusé des envois :", failed.map((f) => `${f.status} ${f.reason}`));
  }

  return json({
    sent: results.filter((r) => r.ok).length,
    revoked: gone.length,
    failed: failed.length,
  });
});
