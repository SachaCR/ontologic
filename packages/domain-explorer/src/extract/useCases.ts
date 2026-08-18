import ts from "typescript";

import type { UseCaseNode } from "./model";
import { makeNodeId } from "./model";
import {
  eachSourceFile,
  isExported,
  locationOf,
  unionMembers,
  unwrapResult,
  type ExtractContext,
} from "./ts-utils";

/** Repository methods that only observe. */
const READ_METHODS = new Set([
  "getById",
  "list",
  "getEvents",
  "getEventsAfter",
]);

/** Repository methods that persist. */
const WRITE_METHODS = new Set(["save", "saveWithEvents"]);

const READ_PREFIXES = /^(find|search|count|get|list)/;

export interface UseCaseExtractionInput {
  /** Class names known to be repositories, used to type-match parameters. */
  repositoryNames: Set<string>;
}

/**
 * Use cases.
 *
 * Unlike every other concept, there is **no base class and no type-level
 * signal** — a use case is a naming and shape convention. Detection is
 * therefore a confidence ladder rather than a predicate, and the confidence is
 * recorded on the node so the renderer can be honest about it.
 *
 * The shapes that must all be recognised:
 *   useCase(repository, id, invoiceId)              positional, repository first
 *   useCase(input, { repoA, repoB })                input + dependencies bag
 *   useCase(id, amount)                             repository is a module singleton
 */
export function extractUseCases(
  ctx: ExtractContext,
  input: UseCaseExtractionInput,
): UseCaseNode[] {
  const useCases: UseCaseNode[] = [];

  eachSourceFile(ctx, (sf) => {
    const singletons = moduleLevelRepositories(sf, input.repositoryNames);

    sf.forEachChild((node) => {
      if (!ts.isFunctionDeclaration(node) || !node.name) return;
      if (!isExported(node)) return;

      const useCase = toUseCaseNode(node, ctx, input, singletons);
      if (useCase) useCases.push(useCase);
    });
  });

  return useCases;
}

/**
 * `const creditBalanceRepository = new CreditBalanceRepository();` at module
 * scope. Some use cases close over one of these instead of taking a parameter,
 * so without this their repository edges would be invisible.
 */
function moduleLevelRepositories(
  sf: ts.SourceFile,
  repositoryNames: Set<string>,
): Map<string, string> {
  const singletons = new Map<string, string>();

  sf.forEachChild((node) => {
    if (!ts.isVariableStatement(node)) return;

    for (const declaration of node.declarationList.declarations) {
      const initializer = declaration.initializer;
      if (!initializer || !ts.isNewExpression(initializer)) continue;

      const className = initializer.expression.getText(sf);
      if (!repositoryNames.has(className)) continue;

      singletons.set(declaration.name.getText(sf), className);
    }
  });

  return singletons;
}

function toUseCaseNode(
  node: ts.FunctionDeclaration,
  ctx: ExtractContext,
  input: UseCaseExtractionInput,
  singletons: Map<string, string>,
): UseCaseNode | undefined {
  const sf = node.getSourceFile();
  const name = node.name?.text;
  if (!name) return undefined;

  const bindings = repositoryBindings(node, input.repositoryNames, singletons);
  const access = analyseRepositoryAccess(node, bindings);

  const result = unwrapResult(node.type);
  const hasResultReturn = result !== undefined;
  const touchesRepository = access.reads.length > 0 || access.writes.length > 0;

  const confidence = rateConfidence(
    hasResultReturn,
    bindings.size > 0,
    touchesRepository,
  );

  if (!confidence) return undefined;

  const location = locationOf(node, ctx.root);

  // Prefer the declared error union. When it is erased to `Error` — which is
  // what an entire real codebase does — fall back to what the body constructs.
  const declaredErrors = result ? unionMembers(result.err) : [];
  const errorUnionErased =
    declaredErrors.length > 0 && declaredErrors.every(isUninformativeErrorType);

  let canFail = declaredErrors;
  if (canFail.length === 0 || errorUnionErased) {
    canFail = errorsConstructedIn(node);
  }

  const useCase: UseCaseNode = {
    id: makeNodeId("useCase", location.file, name),
    kind: "useCase",
    name,
    parameters: node.parameters.map((p) => ({
      name: p.name.getText(sf),
      type: p.type ? p.type.getText(sf).replace(/\s+/g, " ") : "unknown",
    })),
    returnType: node.type
      ? node.type.getText(sf).replace(/\s+/g, " ")
      : "unknown",
    errorUnionErased,
    canFail,
    reads: access.reads,
    writes: access.writes,
    confidence,
    location,
  };

  if (result) {
    useCase.returnsStateTypeName = result.ok.getText(sf).replace(/\s+/g, " ");
  }

  return useCase;
}

function isUninformativeErrorType(name: string): boolean {
  return name === "Error" || name === "unknown" || name === "any";
}

function rateConfidence(
  hasResultReturn: boolean,
  hasRepositoryBinding: boolean,
  touchesRepository: boolean,
): UseCaseNode["confidence"] | undefined {
  if (hasResultReturn && (hasRepositoryBinding || touchesRepository)) {
    return "high";
  }

  // `createOrder` returns a bare `Promise<OrderState>` — no Result, because it
  // has no domain failure mode — but is unambiguously a use case.
  if (hasRepositoryBinding && touchesRepository) return "medium";

  if (hasResultReturn && !touchesRepository) return "low";

  return undefined;
}

/**
 * Local identifiers that refer to a repository: direct parameters, members of a
 * `dependencies` bag destructured or accessed, and module-level singletons.
 */
function repositoryBindings(
  node: ts.FunctionDeclaration,
  repositoryNames: Set<string>,
  singletons: Map<string, string>,
): Map<string, string> {
  const sf = node.getSourceFile();
  const bindings = new Map<string, string>(singletons);

  for (const parameter of node.parameters) {
    const typeNode = parameter.type;
    if (!typeNode) continue;

    // useCase(repository: OrderRepository, …)
    if (ts.isTypeReferenceNode(typeNode)) {
      const typeName = typeNode.typeName.getText(sf);
      if (repositoryNames.has(typeName)) {
        bindings.set(parameter.name.getText(sf), typeName);
      }
      continue;
    }

    // useCase(input, dependencies: { subscriptions: SubscriptionRepository })
    if (ts.isTypeLiteralNode(typeNode)) {
      for (const member of typeNode.members) {
        if (!ts.isPropertySignature(member) || !member.type) continue;
        if (!ts.isTypeReferenceNode(member.type)) continue;

        const typeName = member.type.typeName.getText(sf);
        if (!repositoryNames.has(typeName)) continue;

        bindings.set(member.name.getText(sf), typeName);
      }
    }
  }

  return bindings;
}

/** Which repositories the body reads from, and which it writes to. */
function analyseRepositoryAccess(
  node: ts.FunctionDeclaration,
  bindings: Map<string, string>,
): { reads: string[]; writes: string[] } {
  const reads = new Set<string>();
  const writes = new Set<string>();

  if (!node.body) return { reads: [], writes: [] };

  const sf = node.getSourceFile();

  const visit = (n: ts.Node): void => {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
      const method = n.expression.name.getText(sf);
      // Strip any `dependencies.` prefix so both the destructured and the
      // property-access styles resolve to the same binding.
      const receiver = n.expression.expression.getText(sf).split(".").pop() ?? "";

      const repository = bindings.get(receiver);

      if (repository) {
        if (WRITE_METHODS.has(method)) writes.add(repository);
        else if (READ_METHODS.has(method) || READ_PREFIXES.test(method)) {
          reads.add(repository);
        }
      }
    }

    ts.forEachChild(n, visit);
  };

  visit(node.body);

  return { reads: [...reads], writes: [...writes] };
}

/** Error classes constructed inside `err(...)` in the body. */
function errorsConstructedIn(node: ts.FunctionDeclaration): string[] {
  if (!node.body) return [];

  const sf = node.getSourceFile();
  const names = new Set<string>();

  const visit = (n: ts.Node): void => {
    if (
      ts.isCallExpression(n) &&
      n.expression.getText(sf) === "err" &&
      n.arguments[0] &&
      ts.isNewExpression(n.arguments[0])
    ) {
      names.add(n.arguments[0].expression.getText(sf));
    }

    ts.forEachChild(n, visit);
  };

  visit(node.body);
  return [...names];
}
