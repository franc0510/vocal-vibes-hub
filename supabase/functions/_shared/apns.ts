/**
 * Parler à APNs.
 *
 * Apple n'authentifie pas par mot de passe mais par un JWT ES256 signé avec
 * une clé `.p8` — exactement le mécanisme que ce dépôt utilise déjà pour Sign
 * in with Apple (`generate-apple-jwt.cjs`). La différence tient au public visé
 * et à la durée de vie : ce jeton-ci vaut pour tous les envois d'une heure.
 */

/** Le jeton d'un appareil, tel qu'APNs le connaît. */
export interface ApnsCredentials {
  keyId: string;
  teamId: string;
  /** Le contenu du fichier .p8, en-têtes PEM compris. */
  privateKeyPem: string;
  /** L'identifiant de l'application — `com.vocme.app`. */
  bundleId: string;
  /** `false` en production, `true` pour un build de développement. */
  sandbox?: boolean;
}

const b64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const b64urlText = (text: string): string =>
  b64url(new TextEncoder().encode(text));

/**
 * Le corps d'une clé PEM, en octets.
 *
 * Le fichier `.p8` d'Apple arrive parfois avec des `\n` littéraux quand il
 * transite par une variable d'environnement : les remettre en vraies fins de
 * ligne évite une erreur de clé illisible qui ne dit pas son nom.
 */
export function pemToBytes(pem: string): Uint8Array {
  const body = pem
    .replace(/\\n/g, "\n")
    .replace(/-----BEGIN [^-]+-----/, "")
    .replace(/-----END [^-]+-----/, "")
    .replace(/\s+/g, "");
  const binary = atob(body);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/** Le fragment signable d'un JWT : en-tête et charge utile, en base64url. */
export function unsignedToken(
  credentials: Pick<ApnsCredentials, "keyId" | "teamId">,
  issuedAt: number
): string {
  const header = { alg: "ES256", kid: credentials.keyId };
  const payload = { iss: credentials.teamId, iat: issuedAt };
  return `${b64urlText(JSON.stringify(header))}.${b64urlText(JSON.stringify(payload))}`;
}

/**
 * Signe le jeton d'autorisation APNs.
 *
 * Apple refuse un jeton de plus d'une heure et limite leur création : on en
 * garde donc un en mémoire plutôt que d'en signer un par notification.
 */
export async function signAuthToken(
  credentials: ApnsCredentials,
  now: Date = new Date()
): Promise<string> {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const unsigned = unsignedToken(credentials, issuedAt);

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToBytes(credentials.privateKeyPem),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(unsigned)
  );
  return `${unsigned}.${b64url(new Uint8Array(signature))}`;
}

/** L'hôte APNs à viser selon le type de build. */
export const apnsHost = (sandbox = false): string =>
  sandbox ? "https://api.sandbox.push.apple.com" : "https://api.push.apple.com";

export interface PushPayload {
  title: string;
  body: string;
  /** Ce que le tap doit ouvrir — repris tel quel par le client. */
  extra?: Record<string, string>;
}

/** La charge utile qu'attend APNs, badge et son compris. */
export function apnsBody(payload: PushPayload): Record<string, unknown> {
  return {
    aps: {
      alert: { title: payload.title, body: payload.body },
      sound: "default",
      // `mutable-content` laisse une extension de notification enrichir le
      // message plus tard sans changer le serveur.
      "mutable-content": 1,
    },
    ...(payload.extra ?? {}),
  };
}

export interface SendResult {
  token: string;
  ok: boolean;
  status: number;
  /** Vrai quand Apple dit que ce jeton n'existe plus : à révoquer. */
  gone: boolean;
  reason?: string;
}

/**
 * Envoie une notification à un appareil.
 *
 * Un `410` — ou un `400 BadDeviceToken` — signifie que l'application a été
 * désinstallée : le jeton doit être révoqué, sans quoi la table se remplit de
 * téléphones morts et chaque envoi paie leur échec.
 */
export async function sendToDevice(
  token: string,
  payload: PushPayload,
  credentials: ApnsCredentials,
  authToken: string,
  fetchImpl: typeof fetch = fetch
): Promise<SendResult> {
  const res = await fetchImpl(`${apnsHost(credentials.sandbox)}/3/device/${token}`, {
    method: "POST",
    headers: {
      authorization: `bearer ${authToken}`,
      "apns-topic": credentials.bundleId,
      "apns-push-type": "alert",
      "apns-priority": "10",
    },
    body: JSON.stringify(apnsBody(payload)),
  });

  if (res.ok) return { token, ok: true, status: res.status, gone: false };

  const text = await res.text();
  let reason: string | undefined;
  try { reason = JSON.parse(text)?.reason; } catch { reason = text.slice(0, 120); }
  return {
    token,
    ok: false,
    status: res.status,
    gone: res.status === 410 || reason === "BadDeviceToken" || reason === "Unregistered",
    reason,
  };
}
