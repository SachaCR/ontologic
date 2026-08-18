import ts from "typescript";

import type { Method, RepositoryNode } from "./model";
import { makeNodeId } from "./model";
import {
  eachSourceFile,
  heritageOf,
  isPrivate,
  isStatic,
  locationOf,
  typeArgText,
  type ExtractContext,
} from "./ts-utils";

const IN_MEMORY_BASE = "InMemoryRepository";
const REPOSITORY_INTERFACE = "Repository";

/**
 * Methods provided by the base repository. Anything else a subclass declares is
 * a domain query, and those are the interesting ones — they are where rules
 * like "active means returnedAt is null" actually live.
 */
const BASE_METHODS = new Set([
  "save",
  "saveWithEvents",
  "getById",
  "list",
  "getEvents",
  "getEventsAfter",
  "onChanges",
]);

/**
 * Repositories, in both of the shapes real codebases use.
 *
 * A small codebase writes one class: `class OrderRepository extends
 * InMemoryRepository<Order, OrderEvent>`.
 *
 * A ports-and-adapters codebase writes a port and several adapters:
 *
 *   export interface WorkflowRepository extends Repository<Workflow, WorkflowEvent> {}
 *   export class PostgresWorkflowRepository implements WorkflowRepository { … }
 *   export class InMemoryWorkflowRepository implements WorkflowRepository { … }
 *
 * The **port** is the one that matters for documentation: it is what every use
 * case signature names, so missing it means missing every use-case-to-aggregate
 * edge. Adapters are recorded against their port rather than as separate nodes.
 */
export function extractRepositories(ctx: ExtractContext): RepositoryNode[] {
  const repositories: RepositoryNode[] = [];
  const adapters: { port: string; name: string }[] = [];

  eachSourceFile(ctx, (sf) => {
    sf.forEachChild((node) => {
      if (ts.isInterfaceDeclaration(node)) {
        const port = toPortNode(node, ctx);
        if (port) repositories.push(port);
        return;
      }

      if (!ts.isClassDeclaration(node) || !node.name) return;

      const concrete = toConcreteNode(node, ctx);
      if (concrete) {
        repositories.push(concrete);
        return;
      }

      // Not a repository by itself — but it may implement a port declared
      // elsewhere. Record the claim; ports are matched up afterwards.
      for (const implemented of implementedNames(node)) {
        adapters.push({ port: implemented, name: node.name.text });
      }
    });
  });

  for (const adapter of adapters) {
    const port = repositories.find((r) => r.name === adapter.port);
    if (port && !port.implementations.includes(adapter.name)) {
      port.implementations.push(adapter.name);
    }
  }

  return repositories;
}

/** `interface X extends Repository<Entity, Event>` — the port. */
function toPortNode(
  node: ts.InterfaceDeclaration,
  ctx: ExtractContext,
): RepositoryNode | undefined {
  const sf = node.getSourceFile();

  const extended = node.heritageClauses
    ?.flatMap((clause) => clause.types)
    .find((t) => t.expression.getText(sf) === REPOSITORY_INTERFACE);

  if (!extended) return undefined;

  const name = node.name.text;
  const location = locationOf(node, ctx.root);

  return {
    id: makeNodeId("repository", location.file, name),
    kind: "repository",
    name,
    entityTypeName: typeArgText(extended.typeArguments, 0, sf) ?? "unknown",
    eventUnionTypeName: typeArgText(extended.typeArguments, 1, sf) ?? "unknown",
    isPort: true,
    implementations: [],
    finders: node.members
      .filter(ts.isMethodSignature)
      .filter((m) => !BASE_METHODS.has(m.name.getText(sf)))
      .map((m) => toFinderFromSignature(m, ctx)),
    location,
  };
}

/**
 * `class X extends InMemoryRepository<E, Ev>`, or a class implementing
 * `Repository<E, Ev>` directly rather than through a named port.
 */
function toConcreteNode(
  node: ts.ClassDeclaration,
  ctx: ExtractContext,
): RepositoryNode | undefined {
  const sf = node.getSourceFile();
  const heritage = heritageOf(node);

  let typeArguments = heritage?.typeArguments;
  let matched = heritage?.baseName === IN_MEMORY_BASE;

  if (!matched) {
    const implemented = node.heritageClauses
      ?.filter((clause) => clause.token === ts.SyntaxKind.ImplementsKeyword)
      .flatMap((clause) => clause.types)
      .find((t) => t.expression.getText(sf) === REPOSITORY_INTERFACE);

    if (implemented) {
      matched = true;
      typeArguments = implemented.typeArguments;
    }
  }

  if (!matched) return undefined;

  const name = node.name?.text ?? "(anonymous)";
  const location = locationOf(node, ctx.root);

  return {
    id: makeNodeId("repository", location.file, name),
    kind: "repository",
    name,
    entityTypeName: typeArgText(typeArguments, 0, sf) ?? "unknown",
    eventUnionTypeName: typeArgText(typeArguments, 1, sf) ?? "unknown",
    isPort: false,
    implementations: [],
    finders: node.members
      .filter(ts.isMethodDeclaration)
      .filter((m) => {
        const methodName = m.name.getText(sf);
        return !BASE_METHODS.has(methodName) && !isPrivate(m) && !isStatic(m);
      })
      .map((m) => toFinder(m, ctx)),
    location,
  };
}

/** Interface names a class claims to implement, as written. */
function implementedNames(node: ts.ClassDeclaration): string[] {
  const sf = node.getSourceFile();

  return (node.heritageClauses ?? [])
    .filter((clause) => clause.token === ts.SyntaxKind.ImplementsKeyword)
    .flatMap((clause) => clause.types)
    .map((t) => t.expression.getText(sf));
}

function toFinder(node: ts.MethodDeclaration, ctx: ExtractContext): Method {
  const sf = node.getSourceFile();

  return {
    name: node.name.getText(sf),
    isStatic: false,
    returnType: node.type
      ? node.type.getText(sf).replace(/\s+/g, " ")
      : "unknown",
    parameters: node.parameters.map((p) => ({
      name: p.name.getText(sf),
      type: p.type ? p.type.getText(sf).replace(/\s+/g, " ") : "unknown",
    })),
    emits: [],
    canFail: [],
    location: locationOf(node, ctx.root),
  };
}

function toFinderFromSignature(
  node: ts.MethodSignature,
  ctx: ExtractContext,
): Method {
  const sf = node.getSourceFile();

  return {
    name: node.name.getText(sf),
    isStatic: false,
    returnType: node.type
      ? node.type.getText(sf).replace(/\s+/g, " ")
      : "unknown",
    parameters: node.parameters.map((p) => ({
      name: p.name.getText(sf),
      type: p.type ? p.type.getText(sf).replace(/\s+/g, " ") : "unknown",
    })),
    emits: [],
    canFail: [],
    location: locationOf(node, ctx.root),
  };
}
