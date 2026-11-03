import { existsSync } from "node:fs";
import { resolve } from "node:path";

/** `packages/command-bus-examples/.env`, wherever the process was started from. */
export const ENV_FILE = resolve(__dirname, "..", ".env");

/**
 * Loads the package's `.env` into `process.env`, if there is one. A variable
 * already set in the environment wins over the file, so a one-off override on
 * the command line still works.
 *
 * Uses Node's own loader (20.12+), so no dependency. Returns whether a file was
 * loaded.
 */
export function loadLocalEnv(file: string = ENV_FILE): boolean {
  if (!existsSync(file)) {
    return false;
  }

  process.loadEnvFile(file);

  return true;
}
