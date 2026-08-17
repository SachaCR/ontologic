#!/usr/bin/env node
/**
 * `ontologic-docs` — generate documentation from an Ontologic codebase.
 *
 * Follows the same conventions as the core package's CLI: no arg-parsing
 * library, `main()` returns an exit code, and nothing calls `process.exit()`.
 */

import { writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";

import { extractModel } from "./index";
import type { DomainModel, EntityNode, Finding } from "./extract/model";

interface Options {
  paths: string[];
  project?: string;
  json?: string;
  includeTests: boolean;
}

function parseArgs(argv: string[]): Options {
  const paths: string[] = [];
  let project: string | undefined;
  let json: string | undefined;
  let includeTests = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined) continue;

    if (arg === "--project" || arg === "-p") {
      project = argv[++i];
    } else if (arg.startsWith("--project=")) {
      project = arg.slice("--project=".length);
    } else if (arg === "--json") {
      json = argv[++i];
    } else if (arg.startsWith("--json=")) {
      json = arg.slice("--json=".length);
    } else if (arg === "--include-tests") {
      includeTests = true;
    } else if (!arg.startsWith("-")) {
      paths.push(arg);
    }
  }

  const options: Options = { paths, includeTests };
  if (project !== undefined) options.project = project;
  if (json !== undefined) options.json = json;

  return options;
}

function printUsage(): void {
  console.log(`
ontologic-docs — document an Ontologic domain model

Usage:
  ontologic-docs <path...> [options]
  ontologic-docs --project <tsconfig.json> [options]

Options:
  -p, --project <file>   Analyse the files of a tsconfig instead of scanning paths
      --json <file>      Write the extracted model as JSON
      --include-tests    Include __tests__ directories (excluded by default)
  -h, --help             Show this message

Examples:
  ontologic-docs ./src/domain
  ontologic-docs ./src --json model.json
  ontologic-docs --project ./tsconfig.json
`);
}

/** A readable summary of what was found, for the terminal. */
function printSummary(model: DomainModel): void {
  const byKind = (kind: string): number =>
    model.nodes.filter((n) => n.kind === kind).length;

  console.log(`\nAnalysed ${model.root}\n`);

  const counts: [string, number][] = [
    ["aggregates", byKind("entity")],
    ["value objects", byKind("valueObject")],
    ["domain events", byKind("event")],
    ["domain errors", byKind("error")],
    ["event unions", model.eventUnions.length],
  ];

  for (const [label, count] of counts) {
    if (count > 0) console.log(`  ${String(count).padStart(3)}  ${label}`);
  }

  for (const node of model.nodes) {
    if (node.kind !== "entity" && node.kind !== "valueObject") continue;
    printEntity(node as EntityNode, model);
  }

  if (model.findings.length > 0) {
    console.log(`\nFindings (${model.findings.length}):\n`);
    for (const finding of model.findings) printFinding(finding);
  }
}

function printEntity(entity: EntityNode, model: DomainModel): void {
  const nameOf = (id: string): string =>
    model.nodes.find((n) => n.id === id)?.name ?? id;

  console.log(`\n${entity.name}  (${entity.location.file})`);
  console.log(
    `  state: ${entity.stateFields
      .map((f) => f.name + (f.optional ? "?" : ""))
      .join(", ")}`,
  );

  if (entity.invariants.length > 0) {
    console.log(`  invariants: ${entity.invariants.join(", ")}`);
  }

  for (const method of entity.methods) {
    if (method.emits.length === 0 && method.canFail.length === 0) continue;

    const emits = method.emits.map(nameOf).join(", ");
    const fails = method.canFail.map(nameOf).join(", ");

    console.log(
      `    ${method.name}()` +
        (emits ? `  emits ${emits}` : "") +
        (fails ? `  fails ${fails}` : ""),
    );
  }
}

function printFinding(finding: Finding): void {
  console.log(`  [${finding.code}] ${finding.location.file}:${finding.location.line}`);
  console.log(`      ${finding.message}`);
}

/** Whichever of the relative or absolute path is easier to read. */
function displayPath(target: string): string {
  const fromHere = relative(process.cwd(), target);
  return fromHere.startsWith("..") || fromHere.length > target.length
    ? target
    : fromHere;
}

function main(): number {
  const argv = process.argv.slice(2);

  if (argv.includes("--help") || argv.includes("-h") || argv.length === 0) {
    printUsage();
    return argv.length === 0 ? 1 : 0;
  }

  const options = parseArgs(argv);

  if (!options.project && options.paths.length === 0) {
    console.error("ontologic-docs: provide a source path or --project");
    printUsage();
    return 1;
  }

  let model: DomainModel;

  try {
    const extractOptions: Parameters<typeof extractModel>[0] = {
      paths: options.paths,
      includeTests: options.includeTests,
    };
    if (options.project !== undefined) extractOptions.project = options.project;

    model = extractModel(extractOptions);
  } catch (error) {
    console.error(
      `ontologic-docs: ${error instanceof Error ? error.message : String(error)}`,
    );
    return 1;
  }

  if (model.nodes.length === 0) {
    console.error(
      "ontologic-docs: no Ontologic concepts found. Is this an Ontologic codebase?",
    );
    return 1;
  }

  printSummary(model);

  if (options.json) {
    const target = resolve(options.json);
    writeFileSync(target, `${JSON.stringify(model, null, 2)}\n`, "utf8");
    console.log(`\nModel written to ${displayPath(target)}`);
  }

  return 0;
}

process.exitCode = main();
