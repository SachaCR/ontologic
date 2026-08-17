import ts from "typescript";

import type { Method, RepositoryNode } from "./model";
import { makeNodeId } from "./model";
import {
  eachSourceFile,
  heritageOf,
  implementsNames,
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

export function extractRepositories(ctx: ExtractContext): RepositoryNode[] {
  const repositories: RepositoryNode[] = [];

  eachSourceFile(ctx, (sf) => {
    sf.forEachChild((node) => {
      if (!ts.isClassDeclaration(node) || !node.name) return;

      const repository = toRepositoryNode(node, ctx);
      if (repository) repositories.push(repository);
    });
  });

  return repositories;
}

function toRepositoryNode(
  node: ts.ClassDeclaration,
  ctx: ExtractContext,
): RepositoryNode | undefined {
  const sf = node.getSourceFile();
  const heritage = heritageOf(node);

  // Either extends the bundled in-memory implementation, or implements the
  // Repository interface directly — a production adapter does the latter.
  let typeArguments = heritage?.typeArguments;
  let matched = heritage?.baseName === IN_MEMORY_BASE;

  if (!matched) {
    const clause = node.heritageClauses?.find(
      (h) => h.token === ts.SyntaxKind.ImplementsKeyword,
    );
    const implemented = clause?.types.find(
      (t) => t.expression.getText(sf) === REPOSITORY_INTERFACE,
    );

    if (implemented) {
      matched = true;
      typeArguments = implemented.typeArguments;
    }
  }

  if (!matched || !implementsNames) return undefined;

  const name = node.name?.text ?? "(anonymous)";
  const location = locationOf(node, ctx.root);

  return {
    id: makeNodeId("repository", location.file, name),
    kind: "repository",
    name,
    entityTypeName: typeArgText(typeArguments, 0, sf) ?? "unknown",
    eventUnionTypeName: typeArgText(typeArguments, 1, sf) ?? "unknown",
    finders: node.members
      .filter(ts.isMethodDeclaration)
      .filter((m) => {
        const methodName = m.name.getText(sf);
        return (
          !BASE_METHODS.has(methodName) && !isPrivate(m) && !isStatic(m)
        );
      })
      .map((m) => toFinder(m, ctx)),
    location,
  };
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
