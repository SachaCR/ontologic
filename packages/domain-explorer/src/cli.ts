#!/usr/bin/env node
/**
 * `domain-explorer` — generate documentation from an Ontologic codebase.
 *
 * Follows the same conventions as the core package's CLI: no arg-parsing
 * library, `main()` returns an exit code, and nothing calls `process.exit()`.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { extractModel, renderHtml } from "./index";
import { domainName } from "./render/html";
import type {
  DomainModel,
  EntityNode,
  Finding,
  RepositoryNode,
  UseCaseNode,
} from "./extract/model";

interface Options {
  paths: string[];
  project?: string;
  out?: string;
  json?: string;
  label?: string;
  includeTests: boolean;
}

function parseArgs(argv: string[]): Options {
  const paths: string[] = [];
  let project: string | undefined;
  let out: string | undefined;
  let json: string | undefined;
  let label: string | undefined;
  let includeTests = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined) continue;

    if (arg === "--project" || arg === "-p") {
      project = argv[++i];
    } else if (arg.startsWith("--project=")) {
      project = arg.slice("--project=".length);
    } else if (arg === "--out" || arg === "-o") {
      out = argv[++i];
    } else if (arg.startsWith("--out=")) {
      out = arg.slice("--out=".length);
    } else if (arg === "--json") {
      json = argv[++i];
    } else if (arg.startsWith("--json=")) {
      json = arg.slice("--json=".length);
    } else if (arg === "--label") {
      label = argv[++i];
    } else if (arg.startsWith("--label=")) {
      label = arg.slice("--label=".length);
    } else if (arg === "--include-tests") {
      includeTests = true;
    } else if (!arg.startsWith("-")) {
      paths.push(arg);
    }
  }

  const options: Options = { paths, includeTests };
  if (project !== undefined) options.project = project;
  if (out !== undefined) options.out = out;
  if (json !== undefined) options.json = json;
  if (label !== undefined) options.label = label;

  return options;
}

/**
 * The published version, read from the manifest rather than duplicated here.
 *
 * `dist/cli.js` sits one level under `package.json`, and although `files` ships
 * only `/dist`, npm always includes the manifest — so this resolves in the
 * workspace and from inside someone else's `node_modules` alike. Importing the
 * JSON instead would reach outside `rootDir` and change the shape of `dist`.
 */
function version(): string {
  try {
    const manifest = readFileSync(join(__dirname, "..", "package.json"), "utf8");

    return (JSON.parse(manifest) as { version?: string }).version ?? "unknown";
  } catch {
    // A version is never worth failing a run over.
    return "unknown";
  }
}

function printUsage(): void {
  console.log(`
domain-explorer ${version()} — document an Ontologic domain model

Usage:
  domain-explorer <path...> [options]
  domain-explorer --project <tsconfig.json> [options]

Options:
  -o, --out <file>       Where to write the HTML (default: <codebase>.html)
  -p, --project <file>   Analyse the files of a tsconfig instead of scanning paths
      --json <file>      Write the extracted model as JSON
      --label <text>     Name the analysed codebase, instead of its path on disk
      --include-tests    Include __tests__ directories (excluded by default)
  -V, --version          Print the version
  -h, --help             Show this message

Examples:
  domain-explorer ./src/domain
  domain-explorer --project ./tsconfig.json
  domain-explorer ./src/domain --out docs/domain.html
  domain-explorer ./src/domain --json model.json
  domain-explorer ./src/domain --label "Billing"
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
    ["invariants", byKind("invariant")],
    ["repositories", byKind("repository")],
    ["use cases", byKind("useCase")],
    ["read models", byKind("readModel")],
    ["event unions", model.eventUnions.length],
  ];

  for (const [label, count] of counts) {
    if (count > 0) console.log(`  ${String(count).padStart(3)}  ${label}`);
  }

  for (const node of model.nodes) {
    if (node.kind !== "entity" && node.kind !== "valueObject") continue;
    printEntity(node as EntityNode, model);
  }

  const repositories = model.nodes.filter(
    (n): n is RepositoryNode => n.kind === "repository",
  );

  if (repositories.length > 0) {
    console.log("\nRepositories");
    for (const repository of repositories) {
      const finders = repository.finders.map((f) => `${f.name}()`).join(", ");
      console.log(
        `  ${repository.name} <${repository.entityTypeName}>` +
          (finders ? `  queries: ${finders}` : ""),
      );
    }
  }

  const useCases = model.nodes.filter(
    (n): n is UseCaseNode => n.kind === "useCase",
  );

  if (useCases.length > 0) {
    console.log("\nUse cases");
    for (const useCase of useCases) printUseCase(useCase, model);
  }

  if (model.findings.length > 0) {
    console.log(`\nFindings (${model.findings.length}):\n`);
    for (const finding of model.findings) printFinding(finding);
  }
}

function printUseCase(useCase: UseCaseNode, model: DomainModel): void {
  const nameOf = (id: string): string =>
    model.nodes.find((n) => n.id === id)?.name ?? id;

  // Reads and writes are the interesting part: a use case should read from as
  // many aggregates as it needs and write to exactly one.
  const flow = [
    useCase.reads.length ? `reads ${useCase.reads.join(", ")}` : "",
    useCase.writes.length ? `writes ${useCase.writes.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("  ");

  // The action is the headline: it says what the use case is asked to do, and
  // whether that is a change or a read.
  const action = useCase.actionName ?? useCase.actionTypeName;
  const kind = useCase.actionKind === "unknown" ? "action" : useCase.actionKind;

  console.log(`  ${useCase.name}  ${kind} ${action}`);
  if (flow) console.log(`      ${flow}`);
  if (useCase.canFail.length > 0) {
    console.log(`      fails ${useCase.canFail.map(nameOf).join(", ")}`);
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
    console.log(`  invariants: ${entity.invariants.map(nameOf).join(", ")}`);
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
  console.log(
    `  [${finding.code}] ${finding.location.file}:${finding.location.line}`,
  );
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

  // Before --help, and before anything reads a path: `--version` is the first
  // thing anyone runs against a tool they just installed.
  if (argv.includes("--version") || argv.includes("-V")) {
    console.log(version());
    return 0;
  }

  if (argv.includes("--help") || argv.includes("-h") || argv.length === 0) {
    printUsage();
    return argv.length === 0 ? 1 : 0;
  }

  const options = parseArgs(argv);

  if (!options.project && options.paths.length === 0) {
    console.error("domain-explorer: provide a source path or --project");
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
      `domain-explorer: ${error instanceof Error ? error.message : String(error)}`,
    );
    return 1;
  }

  if (model.nodes.length === 0) {
    console.error(
      "domain-explorer: no Ontologic concepts found. Is this an Ontologic codebase?",
    );
    return 1;
  }

  // One argument should be enough to get a page, so the output file is named
  // after the codebase rather than demanded. Asking for JSON is a different
  // intent, and does not also produce HTML nobody asked for.
  //
  // Derived from the real path, before --label renames what the page displays.
  const outFile =
    options.out ??
    (options.json === undefined
      ? `${domainName(model.root).replace(/\s+/g, "-")}.html`
      : undefined);

  // The analysed path is an absolute one on the machine that ran this, and the
  // page displays it. A report meant to be shared — attached to an email, put
  // behind a URL — should carry a name instead of someone's home directory.
  if (options.label !== undefined) model.root = options.label;

  printSummary(model);

  if (outFile) {
    const target = resolve(outFile);
    writeFileSync(target, renderHtml(model), "utf8");
    console.log(`\nDocumentation written to ${displayPath(target)}`);
  }

  if (options.json) {
    const target = resolve(options.json);
    writeFileSync(target, `${JSON.stringify(model, null, 2)}\n`, "utf8");
    console.log(`Model written to ${displayPath(target)}`);
  }

  return 0;
}

process.exitCode = main();
