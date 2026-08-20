import ts from "typescript";

import type { EventUnion, ReadModelNode, SourceLocation } from "./model";
import { makeNodeId } from "./model";
import {
  docFields,
  eachSourceFile,
  implementsNames,
  locationOf,
  type ExtractContext,
} from "./ts-utils";
import { resolveQuerySites } from "./readModelAccess";
import {
  analyseRepositoryAccess,
  repositoryBindingsOfClass,
} from "./repositoryAccess";

const READ_MODEL_INTERFACE = "ReadModel";
const LISTEN_TO = "listenTo";

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
 *
 * Who reads it comes from `readModelAccess.ts`, in a second pass: a call is only
 * recognisable as a question once every read model name is known.
 */
export function extractReadModels(
  ctx: ExtractContext,
  unions: EventUnion[],
  repositoryNames: Set<string>,
): ReadModelExtractionResult {
  const readModels: ReadModelNode[] = [];
  const undeclared: UndeclaredSubscriber[] = [];

  const membersOfUnion = new Map(unions.map((u) => [u.name, u.memberNames]));

  eachSourceFile(ctx, (sf) => {
    sf.forEachChild((node) => {
      if (!ts.isClassDeclaration(node) || !node.name) return;

      if (implementsNames(node).includes(READ_MODEL_INTERFACE)) {
        readModels.push(
          toReadModelNode(node, ctx, membersOfUnion, repositoryNames),
        );
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

  // A second pass, because recognising `view.getTable(...)` as a question needs
  // every read model name first — and the caller may live in a file that was
  // already walked.
  const sitesByName = resolveQuerySites(
    ctx,
    new Set(readModels.map((r) => r.name)),
  );

  for (const readModel of readModels) {
    readModel.queriedBy = sitesByName.get(readModel.name) ?? [];
  }

  return { readModels, undeclared };
}

function toReadModelNode(
  node: ts.ClassDeclaration,
  ctx: ExtractContext,
  membersOfUnion: Map<string, string[]>,
  repositoryNames: Set<string>,
): ReadModelNode {
  const sf = node.getSourceFile();
  const name = node.name?.text ?? "(anonymous)";
  const location = locationOf(node, ctx.root);

  const declared = readModelTypeArgument(node, sf);
  const subscriptions = subscriptionsIn(node);

  // The whole class, not just `subscribe`: the saves happen inside the handler
  // callbacks, and the analysis recurses to find them.
  const bindings = repositoryBindingsOfClass(node, repositoryNames);
  const access = analyseRepositoryAccess(node, bindings, sf);

  return {
    id: makeNodeId("readModel", location.file, name),
    kind: "readModel",
    name,
    ...docFields(node),
    eventUnionTypeName: declared ?? "unknown",
    declaredEventNames: declared ? (membersOfUnion.get(declared) ?? []) : [],
    consumedEventNames: subscriptions.filter((s) => s !== "*"),
    consumesEverything: subscriptions.includes("*"),
    // Filled by the second pass in `extractReadModels`, which needs every read
    // model name before it can recognise a call on one.
    queriedBy: [],
    writes: access.writes,
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
