import { describe, it, expect, vi } from "vitest";
import {
  pemToBytes,
  unsignedToken,
  signAuthToken,
  apnsHost,
  apnsBody,
  sendToDevice,
} from "./apns";

/**
 * Ce module est la seule chose qui se tienne entre une notification écrite en
 * base et un téléphone. Sa partie délicate est la signature : Apple refuse un
 * jeton mal formé sans dire pourquoi, et un envoi silencieusement refusé
 * ressemble exactement à un envoi qui marche.
 */

/** Une vraie clé P-256, générée ici, pour signer pour de bon. */
async function testKeyPem(): Promise<string> {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", pair.privateKey);
  const b64 = btoa(String.fromCharCode(...new Uint8Array(pkcs8)));
  return `-----BEGIN PRIVATE KEY-----\n${b64.match(/.{1,64}/g)!.join("\n")}\n-----END PRIVATE KEY-----`;
}

const creds = (pem: string) => ({
  keyId: "ABC123DEFG",
  teamId: "WCJHR98346",
  privateKeyPem: pem,
  bundleId: "com.vocme.app",
});

describe("pemToBytes", () => {
  it("accepte une clé avec de vraies fins de ligne", async () => {
    const pem = await testKeyPem();
    expect(pemToBytes(pem).length).toBeGreaterThan(50);
  });

  /**
   * Le cas qui casse en production sans rien dire : un `.p8` collé dans une
   * variable d'environnement arrive souvent avec des `\n` littéraux.
   */
  it("accepte aussi une clé aux retours à la ligne échappés", async () => {
    const pem = await testKeyPem();
    const escaped = pem.replace(/\n/g, "\\n");
    expect(pemToBytes(escaped)).toEqual(pemToBytes(pem));
  });
});

describe("unsignedToken", () => {
  it("porte la clé et l'équipe, en base64url", () => {
    const token = unsignedToken({ keyId: "KEY", teamId: "TEAM" }, 1_700_000_000);
    const [header, payload] = token.split(".");
    expect(JSON.parse(atob(header))).toEqual({ alg: "ES256", kid: "KEY" });
    expect(JSON.parse(atob(payload))).toEqual({ iss: "TEAM", iat: 1_700_000_000 });
  });

  it("n'utilise jamais les caractères que base64url proscrit", () => {
    const token = unsignedToken({ keyId: "K+/=", teamId: "T+/=" }, 1);
    expect(token).not.toMatch(/[+/=]/);
  });
});

describe("signAuthToken", () => {
  it("produit un JWT en trois parties, réellement signé", async () => {
    const pem = await testKeyPem();
    const jwt = await signAuthToken(creds(pem), new Date("2026-09-03T12:00:00Z"));
    const parts = jwt.split(".");
    expect(parts).toHaveLength(3);
    // Une signature ECDSA P-256 fait 64 octets, soit 86 caractères en
    // base64url sans remplissage.
    expect(parts[2].length).toBe(86);
  });

  it("horodate au moment de la signature", async () => {
    const pem = await testKeyPem();
    const jwt = await signAuthToken(creds(pem), new Date("2026-09-03T12:00:00Z"));
    const payload = JSON.parse(atob(jwt.split(".")[1]));
    expect(payload.iat).toBe(Math.floor(Date.UTC(2026, 8, 3, 12) / 1000));
  });
});

describe("apnsHost", () => {
  it("vise la production par défaut", () => {
    expect(apnsHost()).toBe("https://api.push.apple.com");
  });

  /** Un build de développement ne reçoit rien de l'hôte de production. */
  it("vise le bac à sable pour un build de développement", () => {
    expect(apnsHost(true)).toBe("https://api.sandbox.push.apple.com");
  });
});

describe("apnsBody", () => {
  it("met le titre et le corps là où Apple les attend", () => {
    const body = apnsBody({ title: "VocMe", body: "Léa a aimé ton anecdote" });
    expect((body.aps as Record<string, unknown>).alert).toEqual({
      title: "VocMe",
      body: "Léa a aimé ton anecdote",
    });
  });

  it("transporte de quoi ouvrir le bon écran", () => {
    const body = apnsBody({ title: "t", body: "b", extra: { competitionId: "c1" } });
    expect(body.competitionId).toBe("c1");
  });
});

describe("sendToDevice", () => {
  const payload = { title: "t", body: "b" };
  const c = { keyId: "K", teamId: "T", privateKeyPem: "", bundleId: "com.vocme.app" };

  it("réussit sur un 200", async () => {
    const fake = vi.fn().mockResolvedValue(new Response("", { status: 200 }));
    const res = await sendToDevice("jeton", payload, c, "jwt", fake as unknown as typeof fetch);
    expect(res.ok).toBe(true);
    expect(res.gone).toBe(false);
  });

  it("vise le bon appareil et déclare le bon sujet", async () => {
    const fake = vi.fn().mockResolvedValue(new Response("", { status: 200 }));
    await sendToDevice("jeton", payload, c, "jwt", fake as unknown as typeof fetch);
    const [url, init] = fake.mock.calls[0];
    expect(url).toBe("https://api.push.apple.com/3/device/jeton");
    expect((init.headers as Record<string, string>)["apns-topic"]).toBe("com.vocme.app");
    expect((init.headers as Record<string, string>).authorization).toBe("bearer jwt");
  });

  /**
   * Le cas qui compte pour la durée : sans révocation, la table se remplit de
   * téléphones réinstallés et chaque envoi paie leur échec.
   */
  it("reconnaît un appareil disparu sur un 410", async () => {
    const fake = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ reason: "Unregistered" }), { status: 410 })
    );
    const res = await sendToDevice("mort", payload, c, "jwt", fake as unknown as typeof fetch);
    expect(res.gone).toBe(true);
    expect(res.reason).toBe("Unregistered");
  });

  it("reconnaît aussi un jeton invalide annoncé en 400", async () => {
    const fake = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ reason: "BadDeviceToken" }), { status: 400 })
    );
    expect((await sendToDevice("x", payload, c, "jwt", fake as unknown as typeof fetch)).gone).toBe(true);
  });

  /** Une panne passagère ne doit pas faire jeter un jeton valable. */
  it("ne révoque pas sur une erreur passagère", async () => {
    const fake = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ reason: "TooManyRequests" }), { status: 429 })
    );
    const res = await sendToDevice("x", payload, c, "jwt", fake as unknown as typeof fetch);
    expect(res.ok).toBe(false);
    expect(res.gone).toBe(false);
  });

  it("survit à une réponse d'erreur qui n'est pas du JSON", async () => {
    const fake = vi.fn().mockResolvedValue(new Response("<html>oops</html>", { status: 503 }));
    const res = await sendToDevice("x", payload, c, "jwt", fake as unknown as typeof fetch);
    expect(res.ok).toBe(false);
    expect(res.reason).toContain("oops");
  });
});
