/**
 * Assembles generated panels into a vertical video with the original voice
 * behind it — the actual deliverable, rather than a grid of stills.
 *
 * Panels are cut on the timings the storyboard computed from the audio, so a
 * panel changes at the moment the story moves on.
 */

import { writeFile } from "node:fs/promises";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { drawtextFilters, FONT_CANDIDATES, type Caption } from "../../src/lib/captions.js";

export interface VideoPanel {
  /** Absolute path to the panel image. */
  file: string;
  start_ms: number;
  end_ms: number;
}

/**
 * Builds the concat demuxer script ffmpeg reads.
 *
 * The last entry is repeated without a duration: the concat demuxer ignores
 * the final `duration`, so without the repeat the closing panel is dropped to
 * a single frame. Exported because that quirk is exactly the kind of thing
 * worth pinning in a test.
 */
export function buildConcatScript(panels: VideoPanel[]): string {
  if (panels.length === 0) throw new Error("Aucune case à assembler");

  const lines: string[] = [];
  for (const p of panels) {
    const seconds = Math.max(0.2, (p.end_ms - p.start_ms) / 1000);
    lines.push(`file '${p.file.replace(/'/g, "'\\''")}'`);
    lines.push(`duration ${seconds.toFixed(3)}`);
  }
  lines.push(`file '${panels[panels.length - 1].file.replace(/'/g, "'\\''")}'`);
  return lines.join("\n") + "\n";
}

/**
 * The ffmpeg arguments for one story video.
 *
 * 1080x1920 to match how the app shows it. `increase` then `crop` fills the
 * frame without letterboxing, whatever aspect the model returned. `-shortest`
 * ends the video with the voice rather than on the last panel's nominal
 * duration, which drifts by a few frames.
 */
export function ffmpegArgs(
  concatPath: string,
  audioPath: string,
  outPath: string,
  captionFilters: string[] = []
): string[] {
  const video = [
    "scale=1080:1920:force_original_aspect_ratio=increase",
    "crop=1080:1920",
    "fps=30",
    "format=yuv420p",
    ...captionFilters,
  ].join(",");

  return [
    "-y",
    "-loglevel", "error",
    "-f", "concat",
    "-safe", "0",
    "-i", concatPath,
    "-i", audioPath,
    "-map", "0:v",
    "-map", "1:a",
    "-vf", video,
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "23",
    "-c:a", "aac",
    "-b:a", "128k",
    "-shortest",
    "-movflags", "+faststart",
    outPath,
  ];
}

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", (err) =>
      reject(new Error(`${cmd} introuvable ou non exécutable : ${err.message}`))
    );
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} a échoué (${code}) : ${stderr.slice(-400)}`))
    );
  });
}

/** First installed font among the candidates, or undefined if none is. */
export async function findFont(): Promise<string | undefined> {
  for (const path of FONT_CANDIDATES) {
    try {
      await access(path);
      return path;
    } catch {
      /* try the next */
    }
  }
  return undefined;
}

export interface AssembleInput {
  panels: VideoPanel[];
  audioPath: string;
  outPath: string;
  workDir: string;
  /** Distinguishes the concat scripts when several videos build in parallel. */
  tag: string;
  /** Burned-in caption boxes. Omitted, the video carries no text. */
  captions?: Caption[];
  /** Path to a .ttf. Without one the captions are skipped, not faked. */
  fontFile?: string;
}

/** Writes the concat script and runs ffmpeg. Returns the output path. */
export async function assembleVideo(input: AssembleInput): Promise<string> {
  const concatPath = join(input.workDir, `concat-${input.tag}.txt`);
  await writeFile(concatPath, buildConcatScript(input.panels), "utf8");

  let filters: string[] = [];
  if (input.captions?.length && input.fontFile) {
    const files = await Promise.all(
      input.captions.map(async (caption, i) => {
        const file = join(input.workDir, `cap-${input.tag}-${i}.txt`);
        await writeFile(file, caption.text, "utf8");
        return file;
      })
    );
    filters = drawtextFilters(input.captions, files, { fontFile: input.fontFile });
  }

  await run("ffmpeg", ffmpegArgs(concatPath, input.audioPath, input.outPath, filters));
  return input.outPath;
}

/** Whether ffmpeg can actually be run, checked once before spending anything. */
export async function hasFfmpeg(): Promise<boolean> {
  try {
    await run("ffmpeg", ["-version"]);
    return true;
  } catch {
    return false;
  }
}
