#!/usr/bin/env node
/**
 * `npx ontologic init-agents`
 *
 * Copies the AI-agent guidance that ships with this package into the consuming
 * project, so coding agents pick it up from files the project actually commits
 * rather than from node_modules (which agents do not read).
 *
 * Dependency-free by design — `ontologic` promises zero runtime dependencies.
 */

import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";

// dist/cli/index.js → package root
const PACKAGE_ROOT = resolve(__dirname, "..", "..");
const SKILLS_SOURCE = join(PACKAGE_ROOT, "agents", "skills");
const AGENTS_SOURCE = join(PACKAGE_ROOT, "AGENTS.md");

const MARKER_START = "<!-- ontologic:start -->";
const MARKER_END = "<!-- ontologic:end -->";

interface Options {
  force: boolean;
  skillsDir: string;
}

function parseArgs(argv: string[]): { command: string | undefined; options: Options } {
  const positional = argv.filter((arg) => !arg.startsWith("-"));

  const dirFlag = argv.find((arg) => arg.startsWith("--skills-dir="));

  return {
    command: positional[0],
    options: {
      force: argv.includes("--force") || argv.includes("-f"),
      skillsDir: dirFlag
        ? dirFlag.slice("--skills-dir=".length)
        : join(".claude", "skills"),
    },
  };
}

function printUsage(): void {
  console.log(`
ontologic — AI agent setup

Usage:
  npx ontologic init-agents [options]

Copies Ontologic's agent skills into .claude/skills/ and adds an Ontologic
section to your AGENTS.md, so coding agents follow the library's conventions.

Options:
  -f, --force            Overwrite files that already exist
      --skills-dir=DIR   Install skills somewhere else (default: .claude/skills)
  -h, --help             Show this message
`);
}

/** The block appended to a consumer's AGENTS.md, delimited so it can be updated. */
function ontologicSection(): string {
  return [
    MARKER_START,
    "",
    "## Ontologic",
    "",
    "This project uses [`ontologic`](https://ontologic.site) for its domain layer.",
    "",
    "Conventions, the canonical file layout, and the mistakes most often made with",
    "this library are documented in the skills under `.claude/skills/ontologic-*`.",
    "Read `ontologic-domain-modeling` before writing an entity, event, error, or",
    "invariant, and `ontologic-application` before writing a use case or repository.",
    "",
    "The rule that governs everything: **domain failures are returned as `err(...)`,",
    "technical failures are thrown.**",
    "",
    "Full documentation: <https://ontologic.site/llms-full.txt>",
    "",
    MARKER_END,
  ].join("\n");
}

/** Insert or replace the Ontologic block, leaving the rest of the file untouched. */
function upsertAgentsMd(targetPath: string, force: boolean): "created" | "updated" | "skipped" {
  const section = ontologicSection();

  if (!existsSync(targetPath)) {
    writeFileSync(targetPath, `# AGENTS.md\n\n${section}\n`, "utf8");
    return "created";
  }

  const current = readFileSync(targetPath, "utf8");
  const start = current.indexOf(MARKER_START);
  const end = current.indexOf(MARKER_END);

  if (start !== -1 && end !== -1) {
    if (!force) return "skipped";

    const updated =
      current.slice(0, start) + section + current.slice(end + MARKER_END.length);
    writeFileSync(targetPath, updated, "utf8");
    return "updated";
  }

  writeFileSync(targetPath, `${current.trimEnd()}\n\n${section}\n`, "utf8");
  return "updated";
}

function initAgents(options: Options): number {
  if (!existsSync(SKILLS_SOURCE)) {
    console.error(
      `ontologic: could not find bundled skills at ${SKILLS_SOURCE}.\n` +
        `This usually means the package was installed from a source tree that ` +
        `has not been built. Reinstall from npm, or run the CLI from the ` +
        `published package.`,
    );
    return 1;
  }

  const cwd = process.cwd();
  const skillsTarget = resolve(cwd, options.skillsDir);

  mkdirSync(skillsTarget, { recursive: true });

  // `force: false` means existing files win — re-running never clobbers local edits.
  cpSync(SKILLS_SOURCE, skillsTarget, {
    recursive: true,
    force: options.force,
    errorOnExist: false,
  });

  console.log(`ontologic: skills installed in ${options.skillsDir}/`);

  const agentsTarget = resolve(cwd, "AGENTS.md");
  const outcome = upsertAgentsMd(agentsTarget, options.force);

  if (outcome === "skipped") {
    console.log(
      "ontologic: AGENTS.md already has an Ontologic section — left as is " +
        "(re-run with --force to refresh it)",
    );
  } else {
    console.log(`ontologic: AGENTS.md ${outcome}`);
  }

  if (!existsSync(join(cwd, "CLAUDE.md"))) {
    console.log(
      "\nTip: Claude Code reads CLAUDE.md. To reuse AGENTS.md, create a " +
        "CLAUDE.md containing the single line:\n  @AGENTS.md",
    );
  }

  console.log(
    `\nDone.${options.force ? "" : " Existing files were left untouched."}` +
      `\nBundled reference copy: ${AGENTS_SOURCE}`,
  );

  return 0;
}

function main(): number {
  const { command, options } = parseArgs(process.argv.slice(2));

  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printUsage();
    return 0;
  }

  switch (command) {
    case "init-agents":
      return initAgents(options);

    case undefined:
      printUsage();
      return 0;

    default:
      console.error(`ontologic: unknown command "${command}"`);
      printUsage();
      return 1;
  }
}

process.exitCode = main();
