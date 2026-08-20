import { basename } from "node:path";

import ts from "typescript";

import type { QuerySite, SourceLocation } from "./model";
import { eachSourceFile, locationOf, type ExtractContext } from "./ts-utils";

/**
 * Reading *who asks a read model something* out of a codebase.
 *
 * Deliberately parallel to `repositoryAccess.ts`, which answers the same two
 * questions about repositories: which identifier is which read model, and what
 * is done to it.
 *
 * This exists because a read model does not have to persist through a
 * repository. `StatsReport` does, so its readers can be found one hop through
 * the repository it writes. The Postgres read models in the workflow-v2 corpus
 * take a `Knex` and write raw SQL to their own tables, so there is no hop to
 * make and the only way to find their readers is to look for the calls.
 */

/** The `ReadModel` contract itself — wiring, not a question. */
const SUBSCRIBE = "subscribe";

/**
 * Lifecycle hooks a container calls. They are how a read model gets started and
 * stopped, not something a reader can ask it.
 */
const LIFECYCLE = new Set([
  "onModuleInit",
  "onModuleDestroy",
  "onApplicationBootstrap",
  "onApplicationShutdown",
  "beforeApplicationShutdown",
  "start",
  "stop",
]);

/** A query site, plus which read model it is a query site for. */
interface AttributedSite {
  readModel: string;
  site: QuerySite;
}

/**
 * Every place each read model is asked something, keyed by class name.
 *
 * Read models with no reader are simply absent from the map: an unread view is
 * a real fact about a codebase, not a hole in this analysis.
 */
export function resolveQuerySites(
  ctx: ExtractContext,
  readModelNames: Set<string>,
): Map<string, QuerySite[]> {
  const byReadModel = new Map<string, QuerySite[]>();

  if (readModelNames.size === 0) return byReadModel;

  eachSourceFile(ctx, (sf) => {
    const bindings = bindingsIn(sf, readModelNames);
    if (bindings.size === 0) return;

    // Keyed so repeated calls from the same place collect their methods into one
    // entry, rather than listing the caller once per question it asks.
    const found = new Map<string, AttributedSite>();

    const visit = (node: ts.Node): void => {
      const call = queryCallIn(node, bindings, sf);

      if (call) {
        const caller = callerOf(node, sf, ctx.root);

        // A read model calling its own methods is not a reader of itself.
        const isSelf = caller.kind === "class" && caller.name === call.readModel;

        if (!isSelf) {
          const key = [call.readModel, caller.location.file, caller.name].join(
            " ",
          );
          const existing = found.get(key);

          if (existing) {
            if (!existing.site.methods.includes(call.method)) {
              existing.site.methods.push(call.method);
            }
          } else {
            found.set(key, {
              readModel: call.readModel,
              site: {
                name: caller.name,
                kind: caller.kind,
                methods: [call.method],
                location: caller.location,
              },
            });
          }
        }
      }

      node.forEachChild(visit);
    };

    visit(sf);

    for (const { readModel, site } of found.values()) {
      const existing = byReadModel.get(readModel);

      if (existing) existing.push(site);
      else byReadModel.set(readModel, [site]);
    }
  });

  for (const sites of byReadModel.values()) {
    sites.sort(
      (a, b) =>
        a.location.file.localeCompare(b.location.file) ||
        a.location.line - b.location.line,
    );
  }

  return byReadModel;
}

/**
 * Identifiers in this file that hold a read model, and which one.
 *
 * File-wide rather than per scope on purpose: in the workflow-v2 consumers the
 * binding is a `const` in `main()` and the questions are asked from a nested
 * arrow, so a scope-accurate map would miss every one of them. The cost is that
 * two read models bound to the same identifier in one file would be conflated,
 * which no corpus does.
 */
function bindingsIn(
  sf: ts.SourceFile,
  readModelNames: Set<string>,
): Map<string, string> {
  const bindings = new Map<string, string>();

  const written = (typeNode: ts.TypeNode | undefined): string | undefined => {
    if (!typeNode || !ts.isTypeReferenceNode(typeNode)) return undefined;

    const name = typeNode.typeName.getText(sf);
    return readModelNames.has(name) ? name : undefined;
  };

  const visit = (node: ts.Node): void => {
    if (ts.isParameter(node) || ts.isPropertyDeclaration(node)) {
      // `constructor(private readonly stats: StatsReport)`, and the same type
      // written on a field instead.
      const name = written(node.type);
      if (name) bindings.set(node.name.getText(sf), name);
    } else if (ts.isVariableDeclaration(node)) {
      // `const view = new StatsReport(knex)` — how a script gets one, and the
      // only shape the workflow-v2 consumers use.
      const constructed =
        node.initializer &&
        ts.isNewExpression(node.initializer) &&
        ts.isIdentifier(node.initializer.expression) &&
        readModelNames.has(node.initializer.expression.text)
          ? node.initializer.expression.text
          : undefined;

      const name = written(node.type) ?? constructed;
      if (name) bindings.set(node.name.getText(sf), name);
    }

    node.forEachChild(visit);
  };

  visit(sf);

  return bindings;
}

/** The read model and method of `view.getTable(...)`, when that is a question. */
function queryCallIn(
  node: ts.Node,
  bindings: Map<string, string>,
  sf: ts.SourceFile,
): { readModel: string; method: string } | undefined {
  if (!ts.isCallExpression(node)) return undefined;
  if (!ts.isPropertyAccessExpression(node.expression)) return undefined;

  // Strip any `this.` or `dependencies.` prefix, the way repository access does,
  // so every style resolves to the same binding.
  const receiver = node.expression.expression.getText(sf).split(".").pop() ?? "";
  const readModel = bindings.get(receiver);

  if (readModel === undefined) return undefined;

  const method = node.expression.name.getText(sf);

  if (method === SUBSCRIBE || LIFECYCLE.has(method)) return undefined;

  // A call that hands over a callback and takes nothing back is registering
  // interest, not asking a question — `onApplied(event => repaint())`. Judged by
  // shape rather than by name, so the next codebase's differently-named hook is
  // excluded too.
  const registers =
    node.arguments.length > 0 &&
    node.arguments.every(
      (argument) =>
        ts.isArrowFunction(argument) || ts.isFunctionExpression(argument),
    );

  if (registers) return undefined;

  return { readModel, method };
}

/**
 * What to credit the question to.
 *
 * The enclosing class wins over the method it sits in — a page wants to say
 * `GetBookCountUseCase`, not `execute`. Arrow functions assigned to a `const`
 * are stepped over for the same reason: in a consumer script the useful name is
 * `main`, not the `repaint` closure the call happens to sit in.
 */
function callerOf(
  node: ts.Node,
  sf: ts.SourceFile,
  root: string,
): { name: string; kind: QuerySite["kind"]; location: SourceLocation } {
  const ancestors: ts.Node[] = [];

  for (let current = node.parent; current && !ts.isSourceFile(current); ) {
    ancestors.push(current);
    current = current.parent;
  }

  const owner = ancestors.find(
    (a): a is ts.ClassDeclaration => ts.isClassDeclaration(a) && !!a.name,
  );

  if (owner?.name) {
    return {
      name: owner.name.text,
      kind: "class",
      location: locationOf(owner, root),
    };
  }

  const fn = ancestors.find(
    (
      a,
    ): a is ts.FunctionDeclaration | ts.MethodDeclaration | ts.FunctionExpression =>
      (ts.isFunctionDeclaration(a) && !!a.name) ||
      ts.isMethodDeclaration(a) ||
      (ts.isFunctionExpression(a) && !!a.name),
  );

  if (fn) {
    return {
      name: fn.name ? fn.name.getText(sf) : "(anonymous)",
      kind: "function",
      location: locationOf(fn, root),
    };
  }

  // Asked at the top level of a module. The file is the only name there is.
  return {
    name: basename(sf.fileName),
    kind: "module",
    location: locationOf(node, root),
  };
}
