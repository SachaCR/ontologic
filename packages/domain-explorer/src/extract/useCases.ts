import ts from "typescript";

import type { SourceLocation, UseCaseNode } from "./model";
import { makeNodeId } from "./model";
import {
  eachSourceFile,
  heritageOf,
  isExported,
  locationOf,
  typeArgText,
  unionMembers,
  unwrapResult,
  type ExtractContext,
} from "./ts-utils";

/** The interface a use case declares it implements. */
const USE_CASE_INTERFACE = "UseCase";

/** The two base classes an action can extend. */
const COMMAND_BASE = "Command";
const QUERY_BASE = "Query";

/** The method the `UseCase` interface requires. */
const EXECUTE = "execute";

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

/** An exported function that looks like a use case but carries no marker. */
export interface UnmarkedUseCase {
  name: string;
  location: SourceLocation;
}

export interface UseCaseExtractionResult {
  useCases: UseCaseNode[];
  /** Candidates for the `use-case-not-marked` finding. */
  unmarked: UnmarkedUseCase[];
}

/**
 * Use cases.
 *
 * A use case declares itself: `class X implements UseCase<Action, Out, Errors>`.
 * That is a written heritage clause carrying its own type arguments, so it is
 * read the same way repository ports are — by matching syntax, never by asking
 * the checker to resolve an import that may not exist.
 *
 * The action type argument is then resolved against the classes extending
 * `Command` or `Query`, which is what makes the read/write intent a fact of the
 * type system rather than something inferred from whether the body happens to
 * call `save`.
 *
 * Codebases that have not adopted the marker are not silently reported as having
 * no use cases: exported functions that look like one are collected as
 * `unmarked` and surfaced as a finding instead.
 */
export function extractUseCases(
  ctx: ExtractContext,
  input: UseCaseExtractionInput,
): UseCaseExtractionResult {
  const actions = collectActions(ctx);
  const unionAliases = collectUnionAliases(ctx);

  const useCases: UseCaseNode[] = [];
  const unmarked: UnmarkedUseCase[] = [];

  eachSourceFile(ctx, (sf) => {
    const singletons = moduleLevelRepositories(sf, input.repositoryNames);

    sf.forEachChild((node) => {
      if (ts.isClassDeclaration(node)) {
        const useCase = toUseCaseNode(node, ctx, input, actions, unionAliases);
        if (useCase) useCases.push(useCase);
        return;
      }

      if (!ts.isFunctionDeclaration(node) || !node.name) return;
      if (!isExported(node)) return;

      const candidate = rateFunctionCandidate(node, ctx, input, singletons);
      if (candidate) unmarked.push(candidate);
    });
  });

  return { useCases, unmarked };
}

interface ActionDeclaration {
  kind: "command" | "query";
  /** The literal name bound in the subclass, e.g. `"PAY_ORDER"`. */
  actionName?: string;
}

/** `class PayOrderCommand extends Command<"PAY_ORDER", Payload>` */
function collectActions(ctx: ExtractContext): Map<string, ActionDeclaration> {
  const actions = new Map<string, ActionDeclaration>();

  eachSourceFile(ctx, (sf) => {
    sf.forEachChild((node) => {
      if (!ts.isClassDeclaration(node) || !node.name) return;

      const heritage = heritageOf(node);
      if (!heritage) return;

      const kind =
        heritage.baseName === COMMAND_BASE
          ? "command"
          : heritage.baseName === QUERY_BASE
            ? "query"
            : undefined;

      if (!kind) return;

      const action: ActionDeclaration = { kind };

      // The first type argument is a string literal type — strip the quotes so
      // the report shows PAY_ORDER rather than "PAY_ORDER".
      const literal = typeArgText(heritage.typeArguments, 0, sf);
      if (literal) {
        action.actionName = literal.replace(/^["'`]|["'`]$/g, "");
      }

      actions.set(node.name.text, action);
    });
  });

  return actions;
}

/**
 * `type RegisterLoanError = BookNotFound | BookAlreadyOnLoan | …`
 *
 * A use case is as likely to name its error union as to write it inline, and a
 * bare alias name resolves to no error node at all — the failures would silently
 * come back empty.
 */
function collectUnionAliases(ctx: ExtractContext): Map<string, string[]> {
  const aliases = new Map<string, string[]>();

  eachSourceFile(ctx, (sf) => {
    sf.forEachChild((node) => {
      if (!ts.isTypeAliasDeclaration(node)) return;

      aliases.set(node.name.text, unionMembers(node.type));
    });
  });

  return aliases;
}

/** Replace any alias with the types it stands for, one level deep. */
function expandUnionAliases(
  members: string[],
  aliases: Map<string, string[]>,
): string[] {
  const expanded = members.flatMap((member) => aliases.get(member) ?? [member]);

  return [...new Set(expanded)];
}

function toUseCaseNode(
  node: ts.ClassDeclaration,
  ctx: ExtractContext,
  input: UseCaseExtractionInput,
  actions: Map<string, ActionDeclaration>,
  unionAliases: Map<string, string[]>,
): UseCaseNode | undefined {
  const sf = node.getSourceFile();
  const name = node.name?.text;
  if (!name) return undefined;

  // The marker. Type arguments come off the matched clause, not the class, so
  // a second `implements` never shifts them.
  const implemented = node.heritageClauses
    ?.filter((clause) => clause.token === ts.SyntaxKind.ImplementsKeyword)
    .flatMap((clause) => clause.types)
    .find((t) => t.expression.getText(sf) === USE_CASE_INTERFACE);

  if (!implemented) return undefined;

  const actionTypeName =
    typeArgText(implemented.typeArguments, 0, sf) ?? "unknown";

  // `never` is how a use case says it has no domain failure mode. It is a
  // declared answer, not a missing one, so it must not fall through to the
  // `err(new …)` scan below.
  const errorsArgument = implemented.typeArguments?.[2];
  const declaresNoFailure = errorsArgument?.getText(sf).trim() === "never";
  const declaredErrors = declaresNoFailure
    ? []
    : expandUnionAliases(unionMembers(errorsArgument), unionAliases);

  const action = actions.get(actionTypeName);

  const execute = node.members.find(
    (m): m is ts.MethodDeclaration =>
      ts.isMethodDeclaration(m) && m.name.getText(sf) === EXECUTE,
  );

  const bindings = repositoryBindingsOfClass(node, input.repositoryNames);
  const access = analyseRepositoryAccess(execute?.body, bindings, sf);

  const location = locationOf(node, ctx.root);

  const errorUnionErased =
    declaredErrors.length > 0 && declaredErrors.every(isUninformativeErrorType);

  let canFail = declaredErrors;
  if (!declaresNoFailure && (canFail.length === 0 || errorUnionErased)) {
    canFail = errorsConstructedIn(execute?.body, sf);
  }

  const constructor = node.members.find(ts.isConstructorDeclaration);

  const useCase: UseCaseNode = {
    id: makeNodeId("useCase", location.file, name),
    kind: "useCase",
    name,
    actionTypeName,
    actionKind: action?.kind ?? "unknown",
    dependencies: (constructor?.parameters ?? []).map((p) => ({
      name: p.name.getText(sf),
      type: p.type ? p.type.getText(sf).replace(/\s+/g, " ") : "unknown",
    })),
    returnType: execute?.type
      ? execute.type.getText(sf).replace(/\s+/g, " ")
      : "unknown",
    errorUnionErased,
    canFail,
    reads: access.reads,
    writes: access.writes,
    location,
  };

  if (action?.actionName) {
    useCase.actionName = action.actionName;
  }

  const result = unwrapResult(execute?.type);
  if (result) {
    useCase.returnsStateTypeName = result.ok.getText(sf).replace(/\s+/g, " ");
  }

  return useCase;
}

/**
 * Dependencies are constructor parameters — `constructor(private readonly
 * orders: OrderRepository)`. In the body they are reached as `this.orders`,
 * which `analyseRepositoryAccess` resolves by taking the last dotted segment.
 */
function repositoryBindingsOfClass(
  node: ts.ClassDeclaration,
  repositoryNames: Set<string>,
): Map<string, string> {
  const sf = node.getSourceFile();
  const bindings = new Map<string, string>();

  const record = (
    nameNode: ts.BindingName | ts.PropertyName,
    typeNode: ts.TypeNode | undefined,
  ): void => {
    if (!typeNode || !ts.isTypeReferenceNode(typeNode)) return;

    const typeName = typeNode.typeName.getText(sf);
    if (!repositoryNames.has(typeName)) return;

    bindings.set(nameNode.getText(sf), typeName);
  };

  const constructor = node.members.find(ts.isConstructorDeclaration);
  for (const parameter of constructor?.parameters ?? []) {
    record(parameter.name, parameter.type);
  }

  for (const member of node.members) {
    if (ts.isPropertyDeclaration(member)) record(member.name, member.type);
  }

  return bindings;
}

function isUninformativeErrorType(name: string): boolean {
  return name === "Error" || name === "unknown" || name === "any";
}

/**
 * `const creditBalanceRepository = new CreditBalanceRepository();` at module
 * scope — only relevant to the unmarked-candidate ladder now, since a use case
 * class takes its repositories through the constructor.
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

/**
 * The old confidence ladder, demoted.
 *
 * It used to decide what *was* a use case. Now that a use case says so itself,
 * this only recognises the un-migrated shapes so they can be reported rather
 * than ignored:
 *
 *   useCase(repository, id, invoiceId)              positional, repository first
 *   useCase(input, { repoA, repoB })                input + dependencies bag
 *   useCase(id, amount)                             repository is a module singleton
 */
function rateFunctionCandidate(
  node: ts.FunctionDeclaration,
  ctx: ExtractContext,
  input: UseCaseExtractionInput,
  singletons: Map<string, string>,
): UnmarkedUseCase | undefined {
  const sf = node.getSourceFile();
  const name = node.name?.text;
  if (!name) return undefined;

  const bindings = repositoryBindingsOfFunction(
    node,
    input.repositoryNames,
    singletons,
  );
  const access = analyseRepositoryAccess(node.body, bindings, sf);

  const hasResultReturn = unwrapResult(node.type) !== undefined;
  const hasRepositoryBinding = bindings.size > 0;
  const touchesRepository = access.reads.length > 0 || access.writes.length > 0;

  const looksLikeAUseCase =
    (hasResultReturn && (hasRepositoryBinding || touchesRepository)) ||
    (hasRepositoryBinding && touchesRepository);

  if (!looksLikeAUseCase) return undefined;

  return { name, location: locationOf(node, ctx.root) };
}

function repositoryBindingsOfFunction(
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
  body: ts.Node | undefined,
  bindings: Map<string, string>,
  sf: ts.SourceFile,
): { reads: string[]; writes: string[] } {
  const reads = new Set<string>();
  const writes = new Set<string>();

  if (!body) return { reads: [], writes: [] };

  const visit = (n: ts.Node): void => {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
      const method = n.expression.name.getText(sf);
      // Strip any `this.` or `dependencies.` prefix so every style resolves to
      // the same binding.
      const receiver =
        n.expression.expression.getText(sf).split(".").pop() ?? "";

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

  visit(body);

  return { reads: [...reads], writes: [...writes] };
}

/** Error classes constructed inside `err(...)` in the body. */
function errorsConstructedIn(
  body: ts.Node | undefined,
  sf: ts.SourceFile,
): string[] {
  if (!body) return [];

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

  visit(body);
  return [...names];
}
