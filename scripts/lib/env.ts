/**
 * Reads the project's .env, so scripts do not ask for values the app already
 * knows.
 *
 * Environment variables always win: CI points elsewhere, and a shell export is
 * an explicit override that a file on disk should not silently beat.
 */

import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Parses a .env into a plain object. Missing file yields an empty one. */
export async function readEnvFile(path = join(ROOT, ".env")): Promise<Record<string, string>> {
  const values: Record<string, string> = {};
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return values;
  }

  for (const line of raw.split("\n")) {
    if (line.trim().startsWith("#")) continue;
    const [name, ...rest] = line.split("=");
    if (!name || rest.length === 0) continue;
    // Values are commonly quoted in a .env; the quotes are not part of them.
    const value = rest.join("=").trim().replace(/^['"]|['"]$/g, "");
    if (value) values[name.trim()] = value;
  }
  return values;
}

/** First of `names` set in the environment, else in the .env file. */
export async function resolveEnv(...names: string[]): Promise<string | undefined> {
  for (const name of names) {
    if (process.env[name]) return process.env[name];
  }
  const fromFile = await readEnvFile();
  for (const name of names) {
    if (fromFile[name]) return fromFile[name];
  }
  return undefined;
}
