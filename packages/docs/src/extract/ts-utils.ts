import ts from "typescript";
import { relative } from "node:path";

import type { SourceLocation, StateField } from "./model";

/**
 * Shared AST helpers.
 *
 * The guiding rule for this whole module: **match on written syntax, enrich with
 * the checker.** An Ontologic codebase being documented may not have its
 * dependencies installed — `library-examples` has no `node_modules` at all — so
 * `extends DomainEntity<LoanState>` must still be recognised when the
 * `DomainEntity` symbol resolves to nothing. Anything the checker gives us on
 * top of that is a bonus, never a precondition.
 */

export interface ExtractContext {
  program: ts.Program;
  checker: ts.TypeChecker;
  /** Absolute path the analysis was rooted at, for relative locations. */
  root: string;
}

export function locationOf(node: ts.Node, root: string): SourceLocation {
  const sf = node.getSourceFile();
  const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));

  return {
    file: relative(root, sf.fileName).split("\\").join("/"),
    line: line + 1,
  };
}

/**
 * The base class this class extends, by written name, plus its type arguments
 * as written. Returns undefined for classes with no `extends` clause.
 */
export function heritageOf(
  node: ts.ClassDeclaration,
): { baseName: string; typeArguments: ts.NodeArray<ts.TypeNode> | undefined } | undefined {
  const clause = node.heritageClauses?.find(
    (h) => h.token === ts.SyntaxKind.ExtendsKeyword,
  );

  const expr = clause?.types[0];
  if (!expr) return undefined;

  return {
    baseName: expr.expression.getText(node.getSourceFile()),
    typeArguments: expr.typeArguments,
  };
}

/** Names of interfaces this class declares it implements, as written. */
export function implementsNames(node: ts.ClassDeclaration): string[] {
  const clause = node.heritageClauses?.find(
    (h) => h.token === ts.SyntaxKind.ImplementsKeyword,
  );

  return (clause?.types ?? []).map((t) =>
    t.expression.getText(node.getSourceFile()),
  );
}

export function typeArgText(
  typeArguments: ts.NodeArray<ts.TypeNode> | undefined,
  index: number,
  sf: ts.SourceFile,
): string | undefined {
  const arg = typeArguments?.[index];
  return arg ? arg.getText(sf).trim() : undefined;
}

export function isExported(node: ts.Node): boolean {
  return (
    (ts.getCombinedModifierFlags(node as ts.Declaration) &
      ts.ModifierFlags.Export) !==
    0
  );
}

export function isStatic(node: ts.Node): boolean {
  return (
    (ts.getCombinedModifierFlags(node as ts.Declaration) &
      ts.ModifierFlags.Static) !==
    0
  );
}

export function isPrivate(node: ts.Node): boolean {
  return (
    (ts.getCombinedModifierFlags(node as ts.Declaration) &
      ts.ModifierFlags.Private) !==
    0
  );
}

/**
 * Resolve a written type name to its members.
 *
 * Works for a local `interface OrderState { … }` even when the surrounding
 * imports are unresolvable, which is the common case when documenting a
 * codebase whose dependencies are not installed. Returns an empty array when
 * the type cannot be resolved — never throws.
 */
export function membersOfTypeNode(
  typeNode: ts.TypeNode | undefined,
  ctx: ExtractContext,
): StateField[] {
  if (!typeNode) return [];

  let type: ts.Type;
  try {
    type = ctx.checker.getTypeAtLocation(typeNode);
  } catch {
    return [];
  }

  return ctx.checker.getPropertiesOfType(type).map((symbol) => {
    let text = "unknown";
    try {
      text = ctx.checker.typeToString(
        ctx.checker.getTypeOfSymbolAtLocation(symbol, typeNode),
      );
    } catch {
      /* leave as unknown */
    }

    // `exactOptionalPropertyTypes` surfaces optionality as `T | undefined`;
    // the declared `?` is the more faithful signal.
    const optional = (symbol.flags & ts.SymbolFlags.Optional) !== 0;

    return {
      name: symbol.getName(),
      type: optional ? text.replace(/ \| undefined$/, "") : text,
      optional,
    };
  });
}

/**
 * Resolve a `typeof NAME` query, or a bare string literal type, to its literal
 * string value.
 *
 * Domain errors are written both ways:
 *   `DomainError<typeof NAME, Ctx>`  with `const NAME = "ORDER_NOT_FOUND"`
 *   `DomainError<"BOOK_NOT_FOUND", { bookId: string }>`
 */
export function literalStringOfTypeNode(
  typeNode: ts.TypeNode | undefined,
  ctx: ExtractContext,
): string | undefined {
  if (!typeNode) return undefined;

  // Written directly as "SOME_NAME"
  if (
    ts.isLiteralTypeNode(typeNode) &&
    ts.isStringLiteral(typeNode.literal)
  ) {
    return typeNode.literal.text;
  }

  // Written as `typeof NAME` — follow the symbol to its initializer.
  if (ts.isTypeQueryNode(typeNode)) {
    const sf = typeNode.getSourceFile();
    const name = typeNode.exprName.getText(sf);

    const found = findConstStringInitializer(sf, name);
    if (found !== undefined) return found;

    // Fall back to the checker, which handles imported consts.
    try {
      const type = ctx.checker.getTypeAtLocation(typeNode);
      if (type.isStringLiteral()) return type.value;
    } catch {
      /* fall through */
    }
  }

  return undefined;
}

/** Find `const <name> = "literal"` at the top level of a source file. */
function findConstStringInitializer(
  sf: ts.SourceFile,
  name: string,
): string | undefined {
  let result: string | undefined;

  sf.forEachChild((node) => {
    if (result !== undefined || !ts.isVariableStatement(node)) return;

    for (const decl of node.declarationList.declarations) {
      if (
        ts.isIdentifier(decl.name) &&
        decl.name.text === name &&
        decl.initializer &&
        ts.isStringLiteral(decl.initializer)
      ) {
        result = decl.initializer.text;
      }
    }
  });

  return result;
}

/** Resolve a numeric literal type node, e.g. the `1` in `DomainEvent<_, 1, _>`. */
export function literalNumberOfTypeNode(
  typeNode: ts.TypeNode | undefined,
): number | undefined {
  if (
    typeNode &&
    ts.isLiteralTypeNode(typeNode) &&
    ts.isNumericLiteral(typeNode.literal)
  ) {
    return Number(typeNode.literal.text);
  }

  return undefined;
}

/**
 * Split a written type into its top-level union members.
 *
 * Used on the error side of `Result<Event, A | B>`. Operates on syntax rather
 * than the checker so it survives unresolvable imports.
 */
export function unionMembers(typeNode: ts.TypeNode | undefined): string[] {
  if (!typeNode) return [];

  const sf = typeNode.getSourceFile();

  if (ts.isUnionTypeNode(typeNode)) {
    return typeNode.types.map((t) => t.getText(sf).trim());
  }

  return [typeNode.getText(sf).trim()];
}

/**
 * Pull the type arguments out of a written `Result<T, E>`, unwrapping a
 * surrounding `Promise<…>` first when present.
 */
export function unwrapResult(
  typeNode: ts.TypeNode | undefined,
): { ok: ts.TypeNode; err: ts.TypeNode } | undefined {
  let current = typeNode;

  if (
    current &&
    ts.isTypeReferenceNode(current) &&
    current.typeName.getText(current.getSourceFile()) === "Promise"
  ) {
    current = current.typeArguments?.[0];
  }

  if (
    current &&
    ts.isTypeReferenceNode(current) &&
    current.typeName.getText(current.getSourceFile()) === "Result"
  ) {
    const ok = current.typeArguments?.[0];
    const err = current.typeArguments?.[1];
    if (ok && err) return { ok, err };
  }

  return undefined;
}

/** Every `new X(...)` expression appearing anywhere under a node. */
export function collectNewExpressionNames(node: ts.Node): string[] {
  const names: string[] = [];
  const sf = node.getSourceFile();

  const visit = (n: ts.Node): void => {
    if (ts.isNewExpression(n)) {
      names.push(n.expression.getText(sf));
    }
    ts.forEachChild(n, visit);
  };

  visit(node);
  return names;
}

/**
 * Iterate the source files that belong to the analysed codebase.
 *
 * The program follows imports, so it also contains the library's own sources
 * (and anything else reachable). Documenting those would drown the real domain
 * model in `Result`, `WorkflowStatus`, `RenderTreeOptions` and friends, so
 * anything outside the analysed root is skipped.
 */
export function eachSourceFile(
  ctx: ExtractContext,
  visit: (sf: ts.SourceFile) => void,
): void {
  const root = ctx.root.endsWith("/") ? ctx.root : `${ctx.root}/`;

  for (const sf of ctx.program.getSourceFiles()) {
    if (sf.isDeclarationFile) continue;
    if (sf.fileName.includes("node_modules")) continue;
    if (!sf.fileName.startsWith(root)) continue;
    visit(sf);
  }
}
