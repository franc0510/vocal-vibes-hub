import { describe, it, expect } from "vitest";
import { audioFilePart, realDurationMs, TAIL_PADDING_MS } from "./transcribe";

/**
 * « La transcription ne marche pas sur les nouveaux vocme. »
 *
 * Le fichier était envoyé à Whisper en dur comme `audio.mp3`, type
 * `audio/mpeg` — quoi qu'il fût réellement. Or VocMe n'a JAMAIS produit un
 * seul MP3 : iOS enregistre en MP4, les navigateurs en WebM. OpenAI décide du
 * format par le nom et le type de la partie envoyée, pas par les octets :
 * recevant du MP4 déguisé en MP3, elle répond 400 « Invalid file format ».
 *
 * Le défaut dormait tant que le projet ne tenait que `FAL_KEY` — fal reçoit
 * une URL et va chercher le fichier lui-même. Le jour où `OPENAI_API_KEY` a
 * été posée, `transcribe()` a basculé sur ce chemin, et plus rien n'a été
 * transcrit.
 */

describe("le fichier présenté à Whisper", () => {
  const supabaseUrl = (name: string) =>
    `https://projet.supabase.co/storage/v1/object/public/audio/user-1/1757000000000.${name}`;

  /** LA RÉGRESSION : ce que produit un iPhone, et que le code appelait MP3. */
  it("annonce un enregistrement iOS pour ce qu'il est", () => {
    expect(audioFilePart(supabaseUrl("m4a"))).toEqual({
      name: "audio.m4a",
      type: "audio/mp4",
    });
    expect(audioFilePart(supabaseUrl("mp4"))).toEqual({
      name: "audio.mp4",
      type: "audio/mp4",
    });
  });

  it("annonce un enregistrement de navigateur pour ce qu'il est", () => {
    expect(audioFilePart(supabaseUrl("webm"))).toEqual({
      name: "audio.webm",
      type: "audio/webm",
    });
    expect(audioFilePart(supabaseUrl("ogg"))).toEqual({
      name: "audio.ogg",
      type: "audio/ogg",
    });
  });

  it("ne prétend jamais que c'est un MP3", () => {
    for (const ext of ["m4a", "mp4", "webm", "ogg", "aac", "wav"]) {
      expect(audioFilePart(supabaseUrl(ext)).name).not.toBe("audio.mp3");
    }
  });

  /**
   * L'AAC brut ne figure pas dans la liste d'OpenAI, alors que c'est le même
   * flux qu'un conteneur MP4 transporte. Le rejet porterait sur le seul
   * suffixe — d'où le renommage.
   */
  it("fait passer l'AAC sous le nom que l'API accepte", () => {
    expect(audioFilePart(supabaseUrl("aac"))).toEqual({
      name: "audio.m4a",
      type: "audio/mp4",
    });
  });

  /** Une URL signée porte une requête, qui ne fait pas partie du nom. */
  it("ignore ce qui suit le point d'interrogation", () => {
    expect(audioFilePart(`${supabaseUrl("m4a")}?token=abc.def`).name).toBe("audio.m4a");
    expect(audioFilePart(`${supabaseUrl("webm")}#t=3`).name).toBe("audio.webm");
  });

  /** Quand l'URL ne dit rien, l'en-tête du fichier téléchargé tranche. */
  it("se rabat sur le type annoncé par le serveur", () => {
    expect(audioFilePart("https://projet/audio/sans-extension", "audio/webm")).toEqual({
      name: "audio.webm",
      type: "audio/webm",
    });
    expect(audioFilePart("https://projet/audio/sans-extension", "audio/ogg; codecs=opus")).toEqual({
      name: "audio.ogg",
      type: "audio/ogg",
    });
  });

  /**
   * Dernier recours : le format qu'iOS produit, sur lequel l'enregistreur du
   * client se rabat déjà. Surtout pas MP3, que rien ici ne fabrique.
   */
  it("se rabat sur le format d'iOS quand rien ne renseigne", () => {
    expect(audioFilePart("https://projet/audio/sans-extension")).toEqual({
      name: "audio.m4a",
      type: "audio/mp4",
    });
    expect(audioFilePart("")).toEqual({ name: "audio.m4a", type: "audio/mp4" });
    expect(audioFilePart("https://projet/x.bin", "application/octet-stream").name).toBe("audio.m4a");
  });

  it("ne se laisse pas berner par une extension inconnue", () => {
    expect(audioFilePart(supabaseUrl("exe")).name).toBe("audio.m4a");
  });

  /**
   * Un nom d'hôte contient des points : découper l'adresse entière prendrait
   * « co/storage/audio/file » pour une extension.
   */
  it("ne confond pas les points du domaine avec une extension", () => {
    expect(audioFilePart("https://projet.supabase.co/storage/audio/sans-suffixe").name).toBe(
      "audio.m4a"
    );
    expect(
      audioFilePart("https://projet.supabase.co/storage/audio/sans-suffixe", "audio/webm").name
    ).toBe("audio.webm");
  });

  it("accepte la casse de l'extension", () => {
    expect(audioFilePart(supabaseUrl("M4A")).name).toBe("audio.m4a");
  });
});

/**
 * La durée réelle, celle qui décide de la fin d'une vidéo. Le compteur du
 * client arrondit à la seconde inférieure, ce qui coupait les derniers mots.
 */
describe("realDurationMs", () => {
  const segments = [
    { start_ms: 0, end_ms: 4000, text: "a" },
    { start_ms: 4000, end_ms: 9800, text: "b" },
  ];

  it("suit la parole quand elle dépasse le compteur", () => {
    expect(realDurationMs(9, segments)).toBe(9800 + TAIL_PADDING_MS);
  });

  it("garde la durée déclarée quand elle est la plus longue", () => {
    expect(realDurationMs(30, segments)).toBe(30000);
  });

  it("préfère la mesure en millisecondes au compteur de secondes", () => {
    expect(realDurationMs(9, [], 9500)).toBe(9500);
  });

  it("tient sans le moindre segment", () => {
    expect(realDurationMs(12, [])).toBe(12000);
  });
});
