import ts from "typescript";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import type { ExtractContext } from "./ts-utils";

/**
 * Build the `ts.Program` the extractors run against.
 *
 * Two entry points, because the tool has to work on codebases it does not own:
 * a tsconfig when one is available (best fidelity), or a bare directory walk
 * when it is not. Type errors in the analysed project are irrelevant — we never
 * ask whether it compiles, only what it declares — so diagnostics are ignored.
 */

const DEFAULT_OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  strict: true,
  skipLibCheck: true,
  noEmit: true,
  allowJs: false,
};

const SKIP_DIRECTORIES = new Set([
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".git",
  "__tests__",
]);

export interface BuildProgramOptions {
  /** A tsconfig.json to honour, or a directory/file list to walk. */
  project?: string;
  /** Source roots to scan when no project is given. */
  paths?: string[];
  /** Include `__tests__` directories. Off by default — they contain fixtures. */
  includeTests?: boolean;
}

export function buildProgram(options: BuildProgramOptions): ExtractContext {
  if (options.project) {
    return fromTsConfig(resolve(options.project));
  }

  const paths = (options.paths ?? []).map((p) => resolve(p));
  if (paths.length === 0) {
    throw new Error("provide either --project or a source path");
  }

  const files = paths.flatMap((p) =>
    statSync(p).isDirectory()
      ? collectTypeScriptFiles(p, options.includeTests ?? false)
      : [p],
  );

  if (files.length === 0) {
    throw new Error(
      `no TypeScript files found under ${paths.join(", ")}`,
    );
  }

  const program = ts.createProgram(files, DEFAULT_OPTIONS);

  return {
    program,
    checker: program.getTypeChecker(),
    root: commonRoot(paths),
  };
}

function fromTsConfig(configPath: string): ExtractContext {
  if (!existsSync(configPath)) {
    throw new Error(`no tsconfig at ${configPath}`);
  }

  const readResult = ts.readConfigFile(configPath, ts.sys.readFile);
  if (readResult.error) {
    throw new Error(
      `could not read ${configPath}: ${ts.flattenDiagnosticMessageText(readResult.error.messageText, " ")}`,
    );
  }

  const basePath = resolve(configPath, "..");
  const parsed = ts.parseJsonConfigFileContent(
    readResult.config,
    ts.sys,
    basePath,
  );

  const program = ts.createProgram(parsed.fileNames, {
    ...parsed.options,
    noEmit: true,
    skipLibCheck: true,
  });

  return {
    program,
    checker: program.getTypeChecker(),
    root: basePath,
  };
}

function collectTypeScriptFiles(dir: string, includeTests: boolean): string[] {
  const found: string[] = [];

  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);

      if (entry.isDirectory()) {
        if (SKIP_DIRECTORIES.has(entry.name) && !(includeTests && entry.name === "__tests__")) {
          continue;
        }
        walk(full);
        continue;
      }

      if (!/\.tsx?$/.test(entry.name)) continue;
      if (entry.name.endsWith(".d.ts")) continue;
      if (!includeTests && /\.test\.tsx?$/.test(entry.name)) continue;

      found.push(full);
    }
  };

  walk(dir);
  return found;
}

/** The deepest directory containing every given path. */
function commonRoot(paths: string[]): string {
  const first = paths[0];
  if (first === undefined) return process.cwd();
  if (paths.length === 1) {
    return statSync(first).isDirectory() ? first : resolve(first, "..");
  }

  const segmentLists = paths.map((p) => p.split("/"));
  const shortest = Math.min(...segmentLists.map((s) => s.length));
  const shared: string[] = [];

  for (let i = 0; i < shortest; i++) {
    const segment = segmentLists[0]?.[i];
    if (segment === undefined) break;
    if (segmentLists.every((s) => s[i] === segment)) shared.push(segment);
    else break;
  }

  return shared.join("/") || "/";
}
