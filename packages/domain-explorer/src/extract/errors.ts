import ts from "typescript";

import type { ErrorNode } from "./model";
import { makeNodeId } from "./model";
import {
  eachSourceFile,
  heritageOf,
  literalStringOfTypeNode,
  locationOf,
  membersOfTypeNode,
  typeArgText,
  type ExtractContext,
} from "./ts-utils";

/**
 * Typed domain errors: `class X extends DomainError<Name, Context>`.
 *
 * Both spellings of the discriminant occur in the wild — a module-level
 * `const NAME` referenced as `typeof NAME`, and an inline string literal — so
 * the name is resolved rather than read verbatim.
 */
export function extractErrors(ctx: ExtractContext): ErrorNode[] {
  const errors: ErrorNode[] = [];

  eachSourceFile(ctx, (sf) => {
    // Errors are frequently declared several to a file, so walk all statements.
    sf.forEachChild((node) => {
      if (!ts.isClassDeclaration(node) || !node.name) return;

      const heritage = heritageOf(node);
      if (!heritage || heritage.baseName !== "DomainError") return;

      errors.push(toErrorNode(node, ctx));
    });
  });

  return errors;
}

function toErrorNode(
  node: ts.ClassDeclaration,
  ctx: ExtractContext,
): ErrorNode {
  const sf = node.getSourceFile();
  const heritage = heritageOf(node);
  const name = node.name?.text ?? "(anonymous)";
  const location = locationOf(node, ctx.root);

  const errorName =
    literalStringOfTypeNode(heritage?.typeArguments?.[0], ctx) ??
    typeArgText(heritage?.typeArguments, 0, sf) ??
    name;

  return {
    id: makeNodeId("error", location.file, name),
    kind: "error",
    name,
    errorName,
    contextTypeName: typeArgText(heritage?.typeArguments, 1, sf) ?? "unknown",
    contextFields: membersOfTypeNode(heritage?.typeArguments?.[1], ctx),
    setsPrototype: constructorSetsPrototype(node),
    location,
  };
}

/**
 * Whether the constructor re-sets its own prototype.
 *
 * `DomainError`'s constructor ends with
 * `Object.setPrototypeOf(this, DomainError.prototype)`, which clobbers the
 * subclass prototype. Without the subclass repeating the call,
 * `err instanceof MySpecificError` is false while `instanceof DomainError`
 * stays true — so the bug hides until something does a narrow check.
 */
function constructorSetsPrototype(node: ts.ClassDeclaration): boolean {
  const ctor = node.members.find(ts.isConstructorDeclaration);
  if (!ctor?.body) return false;

  const sf = node.getSourceFile();
  let found = false;

  const visit = (n: ts.Node): void => {
    if (
      ts.isCallExpression(n) &&
      n.expression.getText(sf) === "Object.setPrototypeOf"
    ) {
      found = true;
    }
    ts.forEachChild(n, visit);
  };

  visit(ctor.body);
  return found;
}
