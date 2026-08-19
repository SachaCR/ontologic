import ts from "typescript";

import type {
  EventUnion,
  Method,
  ReadModelNode,
  SourceLocation,
} from "./model";
import { makeNodeId } from "./model";
import {
  docFields,
  eachSourceFile,
  implementsNames,
  isPrivate,
  locationOf,
  type ExtractContext,
} from "./ts-utils";

const READ_MODEL_INTERFACE = "ReadModel";
const SUBSCRIBE = "subscribe";
const LISTEN_TO = "listenTo";

/**
 * Lifecycle hooks a container calls. They are how a read model gets wired, not
 * something a reader can ask it, so they are not part of its query surface.
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

/** Something that subscribes to events without declaring itself a read model. */
export interface UndeclaredSubscriber {
  name: string;
  location: SourceLocation;
}

export interface ReadModelExtractionResult {
  readModels: ReadModelNode[];
  /** Candidates for the `read-model-not-declared` finding. */
  undeclared: UndeclaredSubscriber[];
}

/**
 * Read models — the view side.
 *
 * Detected from `implements ReadModel<…>`, the same way a use case is detected
 * from `implements UseCase<…>`. That declaration is the only reliable signal:
 * a `listenTo` call says something subscribes to events, but not whether it is
 * projecting them into a view or sending an email about them, and the shipped
 * corpora contain both. Subscribers that never declare themselves are collected
 * separately and reported rather than guessed at.
 *
 * What it consumes comes from the `listenTo` calls in the class body. Those
 * name events the way they travel — `BOOK_CREATED` — so linking matches on
 * `EventNode.eventName`, not on the class name.
 */
export function extractReadModels(
  ctx: ExtractContext,
  unions: EventUnion[],
): ReadModelExtractionResult {
  const readModels: ReadModelNode[] = [];
  const undeclared: UndeclaredSubscriber[] = [];

  const membersOfUnion = new Map(unions.map((u) => [u.name, u.memberNames]));

  eachSourceFile(ctx, (sf) => {
    sf.forEachChild((node) => {
      if (!ts.isClassDeclaration(node) || !node.name) return;

      if (implementsNames(node).includes(READ_MODEL_INTERFACE)) {
        readModels.push(toReadModelNode(node, ctx, membersOfUnion));
        return;
      }

      // A class that listens but never says what it is.
      if (subscriptionsIn(node).length > 0) {
        undeclared.push({
          name: node.name.text,
          location: locationOf(node, ctx.root),
        });
      }
    });

    // Consumers written as plain functions rather than classes — every one in
    // the workflow-v2 corpus is shaped this way.
    sf.forEachChild((node) => {
      if (!ts.isFunctionDeclaration(node) || !node.name) return;
      if (subscriptionsIn(node).length === 0) return;

      undeclared.push({
        name: node.name.text,
        location: locationOf(node, ctx.root),
      });
    });
  });

  return { readModels, undeclared };
}

function toReadModelNode(
  node: ts.ClassDeclaration,
  ctx: ExtractContext,
  membersOfUnion: Map<string, string[]>,
): ReadModelNode {
  const sf = node.getSourceFile();
  const name = node.name?.text ?? "(anonymous)";
  const location = locationOf(node, ctx.root);

  const declared = readModelTypeArgument(node, sf);
  const subscriptions = subscriptionsIn(node);

  return {
    id: makeNodeId("readModel", location.file, name),
    kind: "readModel",
    name,
    ...docFields(node),
    eventUnionTypeName: declared ?? "unknown",
    declaredEventNames: declared ? (membersOfUnion.get(declared) ?? []) : [],
    consumedEventNames: subscriptions.filter((s) => s !== "*"),
    consumesEverything: subscriptions.includes("*"),
    queries: node.members
      .filter(ts.isMethodDeclaration)
      .filter((m) => !isPrivate(m))
      .filter((m) => {
        const methodName = m.name.getText(sf);
        return methodName !== SUBSCRIBE && !LIFECYCLE.has(methodName);
      })
      .map((m) => toQuery(m, ctx)),
    location,
  };
}

/** The written type argument of `implements ReadModel<…>`. */
function readModelTypeArgument(
  node: ts.ClassDeclaration,
  sf: ts.SourceFile,
): string | undefined {
  const clause = node.heritageClauses?.find(
    (h) => h.token === ts.SyntaxKind.ImplementsKeyword,
  );

  const implemented = clause?.types.find(
    (t) => t.expression.getText(sf) === READ_MODEL_INTERFACE,
  );

  const written = implemented?.typeArguments?.[0]?.getText(sf).trim();

  return written === undefined || written === "" ? undefined : written;
}

/**
 * Event names passed to `listenTo`, in the order written.
 *
 * Only string literals count. A name computed at runtime cannot be read off the
 * syntax, and inventing one would be worse than admitting the gap.
 */
function subscriptionsIn(node: ts.Node): string[] {
  const names: string[] = [];

  const visit = (current: ts.Node): void => {
    if (
      ts.isCallExpression(current) &&
      ts.isPropertyAccessExpression(current.expression) &&
      current.expression.name.text === LISTEN_TO
    ) {
      // `listenTo` is typed to the event union, so a name this codebase does not
      // publish usually arrives wearing a cast. Unwrap before reading it —
      // otherwise the one case worth reporting is the one that goes unseen.
      let first = current.arguments[0];

      while (
        first &&
        (ts.isAsExpression(first) || ts.isParenthesizedExpression(first))
      ) {
        first = first.expression;
      }

      if (first && ts.isStringLiteralLike(first)) names.push(first.text);
    }

    current.forEachChild(visit);
  };

  visit(node);

  return names;
}

function toQuery(node: ts.MethodDeclaration, ctx: ExtractContext): Method {
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
