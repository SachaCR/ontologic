import ts from "typescript";

import type {
  EntityNode,
  Method,
  RepositoryNode,
  SourceLocation,
  StateField,
  UseCaseNode,
  UseCasePath,
  UseCaseStep,
} from "./model";
import { makeNodeId } from "./model";
import {
  docFields,
  eachSourceFile,
  membersOfTypeNode,
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
  /**
   * Already-extracted entities and repositories.
   *
   * Needed to answer "which events does this call produce": the repository says
   * which entity it persists, and the entity's method already declares what it
   * emits. Both are read as written names — `link.ts` resolves them to node ids
   * in the same pass that resolves `Method.emits`.
   */
  entities: EntityNode[];
  repositories: RepositoryNode[];
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

  // Repository -> the entity it persists, and entity -> its methods. Both are
  // written names; `link.ts` resolves the resulting event names to node ids.
  const entityByRepository = new Map(
    input.repositories.map((r) => [r.name, r.entityTypeName] as const),
  );
  const methodsByEntity = new Map(
    input.entities.map((e) => [e.name, e.methods] as const),
  );

  const useCases: UseCaseNode[] = [];
  const unmarked: UnmarkedUseCase[] = [];

  eachSourceFile(ctx, (sf) => {
    const singletons = moduleLevelRepositories(sf, input.repositoryNames);

    sf.forEachChild((node) => {
      if (ts.isClassDeclaration(node)) {
        const useCase = toUseCaseNode(node, ctx, input, actions, unionAliases, {
          entityByRepository,
          methodsByEntity,
        });
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
  /** The payload members, from the second type argument. */
  fields: StateField[];
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

      // The second type argument is the payload — the shape a caller supplies.
      const action: ActionDeclaration = {
        kind,
        fields: membersOfTypeNode(heritage.typeArguments?.[1], ctx),
      };

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
  lookups: {
    entityByRepository: Map<string, string>;
    methodsByEntity: Map<string, Method[]>;
  },
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
  const analysis = analyseBody(
    execute?.body,
    sf,
    bindings,
    lookups.entityByRepository,
    lookups.methodsByEntity,
  );

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
    ...docFields(node),
    actionTypeName,
    actionKind: action?.kind ?? "unknown",
    actionFields: action?.fields ?? [],
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
    emits: analysis.emits,
    eventsUndetermined: analysis.undetermined,
    paths: analysis.paths,
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

/**
 * What a use case body does, in order.
 *
 * `saveWithEvents(entity, domainEvents)` is the anchor for events: its second
 * argument is, by contract, exactly what gets emitted. The paths come from the
 * same walk — every `if` in these bodies is a single-branch early exit, so the
 * body is a straight spine with guards hanging off it. The success path is that
 * spine with the guards removed; each failure path is the prefix up to one
 * guard.
 *
 * Purely syntactic, per the rule in ts-utils.ts — every hop is a name looked up
 * in a map the model already built, never a checker query.
 *
 * `throw` sites are deliberately not paths. Every one in the corpus has the form
 * `throw <repoResult>.error`: infrastructure failed, which is not a domain
 * outcome and does not belong on a board.
 */
function analyseBody(
  body: ts.Block | undefined,
  sf: ts.SourceFile,
  bindings: Map<string, string>,
  entityByRepository: Map<string, string>,
  methodsByEntity: Map<string, Method[]>,
): { emits: string[]; undetermined: boolean; paths: UseCasePath[] } {
  if (!body) return { emits: [], undetermined: false, paths: [] };

  /** `const x = <init>` — destructured names all point at the same initialiser. */
  const locals = new Map<string, ts.Expression>();

  const collectLocals = (n: ts.Node): void => {
    if (ts.isVariableDeclaration(n) && n.initializer) {
      if (ts.isIdentifier(n.name)) {
        locals.set(n.name.text, n.initializer);
      } else if (ts.isObjectBindingPattern(n.name)) {
        // `const { book, event } = Book.create(...)` — the property names are
        // not stable across codebases (`event` here, `creationEvent` there), so
        // both names resolve through the factory call rather than by name.
        for (const element of n.name.elements) {
          if (ts.isIdentifier(element.name)) {
            locals.set(element.name.text, n.initializer);
          }
        }
      }
    }
    ts.forEachChild(n, collectLocals);
  };
  collectLocals(body);

  const receiverText = (expression: ts.Expression): string =>
    expression.getText(sf).split(".").pop() ?? "";

  const unwrapAwait = (expression: ts.Expression): ts.Expression =>
    ts.isAwaitExpression(expression)
      ? unwrapAwait(expression.expression)
      : expression;

  /** Which entity an expression ultimately denotes, by written name. */
  const entityOf = (
    expression: ts.Expression,
    seen: Set<ts.Node>,
  ): string | undefined => {
    if (seen.has(expression)) return undefined;
    seen.add(expression);

    if (ts.isAwaitExpression(expression)) {
      return entityOf(expression.expression, seen);
    }

    if (ts.isPropertyAccessExpression(expression)) {
      // `lookup.value` — the Result wrapper is transparent here.
      return entityOf(expression.expression, seen);
    }

    if (ts.isIdentifier(expression)) {
      // `Book.create(...)` — the receiver is the entity's own name, not a local.
      if (methodsByEntity.has(expression.text)) return expression.text;

      const bound = locals.get(expression.text);
      return bound ? entityOf(bound, seen) : undefined;
    }

    if (
      ts.isCallExpression(expression) &&
      ts.isPropertyAccessExpression(expression.expression)
    ) {
      const receiver = receiverText(expression.expression.expression);

      // `this.libraryCollection.getById(...)` -> LibraryCollection -> Book
      const repository = bindings.get(receiver);
      if (repository) return entityByRepository.get(repository);

      // `Book.create(...)` — a static factory names its entity directly.
      if (methodsByEntity.has(receiver)) return receiver;
    }

    return undefined;
  };

  /** The method declared on `entity` with this name, if any. */
  const methodOf = (
    entity: string | undefined,
    name: string,
  ): Method | undefined =>
    (methodsByEntity.get(entity ?? "") ?? []).find((m) => m.name === name);

  let undetermined = false;
  const emits = new Set<string>();

  /** Event class names an expression evaluates to. */
  const resolveEvents = (
    expression: ts.Expression,
    seen: Set<ts.Node>,
  ): void => {
    if (seen.has(expression)) return;
    seen.add(expression);

    if (ts.isAwaitExpression(expression)) {
      return resolveEvents(expression.expression, seen);
    }

    if (ts.isNewExpression(expression)) {
      // The use case built the event itself.
      emits.add(expression.expression.getText(sf));
      return;
    }

    if (ts.isArrayLiteralExpression(expression)) {
      if (expression.elements.length === 0) return;
      for (const element of expression.elements) resolveEvents(element, seen);
      return;
    }

    if (ts.isIdentifier(expression)) {
      const bound = locals.get(expression.text);

      if (bound && ts.isArrayLiteralExpression(bound)) {
        // An accumulator: the events are whatever was pushed into it.
        resolvePushesInto(expression.text, seen);
        return;
      }

      if (!bound) {
        undetermined = true;
        return;
      }

      resolveEvents(bound, seen);
      return;
    }

    if (ts.isPropertyAccessExpression(expression)) {
      // `result.value` — unwrap and resolve what produced the Result.
      resolveEvents(expression.expression, seen);
      return;
    }

    if (
      ts.isCallExpression(expression) &&
      ts.isPropertyAccessExpression(expression.expression)
    ) {
      const entity = entityOf(expression.expression.expression, new Set());
      const method = methodOf(entity, expression.expression.name.getText(sf));

      if (!method) {
        undetermined = true;
        return;
      }

      for (const name of method.emits) emits.add(name);
      return;
    }

    undetermined = true;
  };

  /** `domainEvents.push(x)` — every argument pushed into a named accumulator. */
  const resolvePushesInto = (name: string, seen: Set<ts.Node>): void => {
    const visit = (n: ts.Node): void => {
      if (
        ts.isCallExpression(n) &&
        ts.isPropertyAccessExpression(n.expression) &&
        n.expression.name.getText(sf) === "push" &&
        n.expression.expression.getText(sf) === name
      ) {
        for (const argument of n.arguments) resolveEvents(argument, seen);
      }
      ts.forEachChild(n, visit);
    };
    visit(body);
  };

  /**
   * Error class names an `err(...)` argument evaluates to.
   *
   * Two shapes in practice: constructed inline, or propagated from an entity
   * method's Result — `err(outcome.error)`, where the method's declared error
   * union names them. A union with several members yields several errors from
   * the one position.
   */
  const resolveErrors = (
    expression: ts.Expression,
    into: Set<string>,
  ): void => {
    if (ts.isNewExpression(expression)) {
      into.add(expression.expression.getText(sf));
      return;
    }

    if (ts.isPropertyAccessExpression(expression)) {
      const produced = locals.get(receiverText(expression.expression));

      if (
        produced &&
        ts.isCallExpression(produced) &&
        ts.isPropertyAccessExpression(produced.expression)
      ) {
        const entity = entityOf(produced.expression.expression, new Set());
        const method = methodOf(entity, produced.expression.name.getText(sf));

        if (method) {
          for (const name of method.canFail) into.add(name);
          return;
        }
      }
    }

    if (ts.isIdentifier(expression)) {
      const bound = locals.get(expression.text);
      if (bound) return resolveErrors(bound, into);
    }
  };

  /** Every error returned by an `err(...)` anywhere inside a statement. */
  const errorsReturnedIn = (statement: ts.Node): string[] => {
    const found = new Set<string>();

    const visit = (n: ts.Node): void => {
      if (
        ts.isCallExpression(n) &&
        n.expression.getText(sf) === "err" &&
        n.arguments[0]
      ) {
        resolveErrors(n.arguments[0], found);
      }
      ts.forEachChild(n, visit);
    };

    visit(statement);
    return [...found];
  };

  // ---- the ordered walk ----

  const steps: UseCaseStep[] = [];
  const guards: { at: number; errors: string[] }[] = [];

  /** A call on a repository or an entity becomes a step. */
  const stepFor = (expression: ts.Expression): UseCaseStep | undefined => {
    const call = unwrapAwait(expression);

    if (
      !ts.isCallExpression(call) ||
      !ts.isPropertyAccessExpression(call.expression)
    ) {
      return undefined;
    }

    const method = call.expression.name.getText(sf);
    const receiver = receiverText(call.expression.expression);
    const repository = bindings.get(receiver);

    if (repository) {
      const entity = entityByRepository.get(repository);
      if (!entity) return undefined;

      if (WRITE_METHODS.has(method)) {
        // The write is also where the events are named.
        const argument = call.arguments[1];
        if (argument) resolveEvents(argument, new Set());
        else if (method === "saveWithEvents") undetermined = true;

        return { kind: "write", name: entity, detail: method };
      }

      if (READ_METHODS.has(method) || READ_PREFIXES.test(method)) {
        return { kind: "read", name: entity, detail: method };
      }

      return undefined;
    }

    const entity = entityOf(call.expression.expression, new Set());
    if (entity && methodOf(entity, method)) {
      return { kind: "call", name: entity, detail: method };
    }

    return undefined;
  };

  for (const statement of body.statements) {
    // A guard: an `if` whose branch returns a domain failure. `throw` branches
    // are infrastructure and produce no `err(...)`, so they fall through here.
    if (ts.isIfStatement(statement)) {
      const errors = errorsReturnedIn(statement);
      if (errors.length > 0) guards.push({ at: steps.length, errors });
      continue;
    }

    const expressions: ts.Expression[] = [];

    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (declaration.initializer) expressions.push(declaration.initializer);
      }
    } else if (ts.isExpressionStatement(statement)) {
      expressions.push(statement.expression);
    }

    for (const expression of expressions) {
      const step = stepFor(expression);
      if (step) steps.push(step);
    }
  }

  const paths: UseCasePath[] = [];

  if (steps.length > 0 || emits.size > 0) {
    // A query has no event: the renderer ends its path with the state it
    // returns, which is the read model in event-storming terms.
    paths.push({ kind: "success", steps: steps.slice(), outcome: [...emits] });
  }

  for (const guard of guards) {
    paths.push({
      kind: "failure",
      steps: steps.slice(0, guard.at),
      outcome: guard.errors,
    });
  }

  return { emits: [...emits], undetermined, paths };
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
