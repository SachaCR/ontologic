import { afterEach, describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadLocalEnv } from "../env";

const KEY = "COMMAND_BUS_EXAMPLES_ENV_TEST";
let dir: string | undefined;

afterEach(() => {
  delete process.env[KEY];
  if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

function envFile(content: string): string {
  dir = mkdtempSync(join(tmpdir(), "cbx-env-"));
  const file = join(dir, ".env");
  writeFileSync(file, content);
  return file;
}

describe("loadLocalEnv", () => {
  it("loads the variables of the file", () => {
    loadLocalEnv(envFile(`${KEY}=from-file\n`));

    expect(process.env[KEY]).toBe("from-file");
  });

  it("lets a variable already set win over the file", () => {
    process.env[KEY] = "from-shell";

    loadLocalEnv(envFile(`${KEY}=from-file\n`));

    expect(process.env[KEY]).toBe("from-shell");
  });

  it("does nothing without a file", () => {
    expect(loadLocalEnv(join(tmpdir(), "no-such-dir", ".env"))).toBe(false);
  });
});
