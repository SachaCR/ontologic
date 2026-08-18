import ts from "typescript";

import type { InvariantNode } from "./model";
import { makeNodeId } from "./model";
import {
  eachSourceFile,
  locationOf,
  typeArgText,
  type ExtractContext,
} from "./ts-utils";

const INVARIANT_CLASS = "BaseDomainInvariant";

/**
 * Invariants: `new BaseDomainInvariant<State>(description, predicate)`.
 *
 * The `State` type argument is the link back to the entity that owns the rule,
 * and the first argument is the only human-readable label the codebase carries
 * — it is a string literal in every corpus, never a variable or template.
 *
 * Composed invariants (`a.and(b)`) are deliberately not modelled: the composed
 * object takes a raw check function and has no description of its own, so only
 * the leaves are nameable.
 */
export function extractInvariants(ctx: ExtractContext): InvariantNode[] {
  const invariants: InvariantNode[] = [];

  eachSourceFile(ctx, (sf) => {
    sf.forEachChild((node) => {
      if (!ts.isVariableStatement(node)) return;

      for (const declaration of node.declarationList.declarations) {
        const invariant = toInvariantNode(declaration, ctx);
        if (invariant) invariants.push(invariant);
      }
    });
  });

  return invariants;
}

function toInvariantNode(
  declaration: ts.VariableDeclaration,
  ctx: ExtractContext,
): InvariantNode | undefined {
  const initializer = declaration.initializer;
  if (!initializer || !ts.isNewExpression(initializer)) return undefined;

  const sf = declaration.getSourceFile();
  if (initializer.expression.getText(sf) !== INVARIANT_CLASS) return undefined;

  const name = declaration.name.getText(sf);
  const location = locationOf(declaration, ctx.root);

  const [descriptionArg, predicateArg] = initializer.arguments ?? [];

  const description =
    descriptionArg && ts.isStringLiteral(descriptionArg)
      ? descriptionArg.text
      : name;

  return {
    id: makeNodeId("invariant", location.file, name),
    kind: "invariant",
    name,
    description,
    stateTypeName: typeArgText(initializer.typeArguments, 0, sf) ?? "unknown",
    predicate: predicateArg
      ? predicateArg.getText(sf).replace(/\s+/g, " ").trim()
      : "",
    location,
  };
}
