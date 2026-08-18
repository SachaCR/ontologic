import ts from "typescript";
import { relative } from "node:path";

import type { SourceLocation, StateField, TypeRef } from "./model";

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
):
  | { baseName: string; typeArguments: ts.NodeArray<ts.TypeNode> | undefined }
  | undefined {
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
 * The leading doc comment of a declaration, as prose.
 *
 * Read off the syntax tree rather than through the checker, for the same reason
 * everything else here is: the analysed codebase may not resolve its imports.
 *
 * Only the description is kept — `@param` and friends are structural
 * annotations, and the model already carries that information in typed form.
 * Most declarations have no doc comment at all, so every consumer must render
 * correctly without one.
 */
export function docOf(node: ts.Node): string | undefined {
  const comments = ts.getJSDocCommentsAndTags(node);

  for (const comment of comments) {
    if (!ts.isJSDoc(comment)) continue;

    const text =
      typeof comment.comment === "string"
        ? comment.comment
        : (comment.comment ?? [])
            .map((part) => part.text)
            .join("")
            .trim();

    const collapsed = text.replace(/\s+/g, " ").trim();
    if (collapsed) return collapsed;
  }

  return undefined;
}

/**
 * The doc comment as a spreadable fragment.
 *
 * `exactOptionalPropertyTypes` is on, so an inline
 * `...(doc ? { description: doc } : {})` widens the property to
 * `string | undefined` and stops assigning. Naming the return type keeps the
 * property genuinely optional.
 */
export function docFields(node: ts.Node): { description?: string } {
  const description = docOf(node);

  return description === undefined ? {} : { description };
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

    const field: StateField = {
      name: symbol.getName(),
      type: optional ? text.replace(/ \| undefined$/, "") : text,
      optional,
    };

    try {
      const refs = resolveTypeRefs(
        ctx.checker.getTypeOfSymbolAtLocation(symbol, typeNode),
        ctx,
        "state",
      );
      if (refs.length > 0) field.refs = refs;
    } catch {
      /* leave refs absent */
    }

    return field;
  });
}

const COLLECTION_VALUE_ARGUMENT: Record<string, number> = {
  Array: 0,
  ReadonlyArray: 0,
  Set: 0,
  ReadonlySet: 0,
  // A Map's domain content is the value side; the key is an id string.
  Map: 1,
  ReadonlyMap: 1,
  Record: 1,
};

/**
 * Resolve a type back to the declarations it ultimately refers to.
 *
 * Three transformations, each required by a real case:
 *
 * - **Unwrap collections.** `nodes: Map<string, WorkflowNode>` is containment of
 *   `WorkflowNode`; the `string` key is not part of the domain.
 * - **Expand unions.** `tool: WorkflowNodeTool` is an alias over six tool value
 *   objects. This runs through the checker rather than the written syntax because
 *   union aliases are not always written as plain references — one in the wild is
 *   built from `ReturnType<LLMTool['readState']>`, which a syntactic walk reads
 *   as the type `ReturnType`.
 * - **Classify from the declaration.** The printed type cannot distinguish a
 *   plain data interface from a live sub-entity.
 */
export function resolveTypeRefs(
  type: ts.Type,
  ctx: ExtractContext,
  via: TypeRef["via"],
): TypeRef[] {
  const found: TypeRef[] = [];
  const seen = new Set<ts.Type>();

  const visit = (
    current: ts.Type,
    arity: TypeRef["arity"],
    family: string | undefined,
  ): void => {
    if (seen.has(current)) return;
    seen.add(current);

    if (current.isUnion() || current.isIntersection()) {
      // Remember the alias so the members can be presented as one family rather
      // than as a row of near-identical siblings.
      const aliasName = current.aliasSymbol?.getName();
      const memberFamily =
        family ?? (current.types.length > 1 ? aliasName : undefined);

      for (const member of current.types) visit(member, arity, memberFamily);
      return;
    }

    // Primitives, null and undefined carry no domain object.
    if (
      current.flags &
      (ts.TypeFlags.StringLike |
        ts.TypeFlags.NumberLike |
        ts.TypeFlags.BooleanLike |
        ts.TypeFlags.BigIntLike |
        ts.TypeFlags.ESSymbolLike |
        ts.TypeFlags.EnumLike |
        ts.TypeFlags.Null |
        ts.TypeFlags.Undefined |
        ts.TypeFlags.Void |
        ts.TypeFlags.Never |
        ts.TypeFlags.Any |
        ts.TypeFlags.Unknown)
    ) {
      return;
    }

    if (ctx.checker.isArrayType(current)) {
      const element = ctx.checker.getTypeArguments(
        current as ts.TypeReference,
      )[0];
      if (element) visit(element, "many", family);
      return;
    }

    const symbol = current.aliasSymbol ?? current.getSymbol();
    if (!symbol) return;

    const name = symbol.getName();

    const valueIndex = COLLECTION_VALUE_ARGUMENT[name];
    if (valueIndex !== undefined) {
      const args = safeTypeArguments(current, ctx);
      const value = args[valueIndex];
      if (value) visit(value, "many", family);
      return;
    }

    const declaration = symbol.declarations?.[0];
    if (!declaration) return;

    const kind = classifyDeclaration(declaration);
    if (!kind) return;

    found.push({
      symbol: name,
      file: relativeToRoot(ctx.root, declaration.getSourceFile().fileName),
      arity,
      via,
      declaration: kind,
      ...(family !== undefined ? { family } : {}),
    });
  };

  visit(type, "one", undefined);

  return dedupeRefs(found);
}

/**
 * What a declaration is, for containment purposes.
 *
 * `subEntityClass` covers the library's own canonical sub-entity: a plain class
 * with `serialize()` and `static fromState`, and deliberately no heritage. It is
 * the one shape the entity extractor cannot see, because that gates on
 * `extends DomainEntity | ValueObject`.
 */
function classifyDeclaration(
  declaration: ts.Declaration,
): TypeRef["declaration"] | undefined {
  if (ts.isInterfaceDeclaration(declaration)) return "plain";
  if (!ts.isClassDeclaration(declaration)) return undefined;

  const heritage = heritageOf(declaration);
  if (
    heritage &&
    (heritage.baseName === "DomainEntity" ||
      heritage.baseName === "ValueObject")
  ) {
    return "domainClass";
  }

  const sf = declaration.getSourceFile();
  const memberNames = declaration.members.map((m) =>
    m.name ? m.name.getText(sf) : "",
  );

  const looksLikeSubEntity =
    memberNames.includes("serialize") || memberNames.includes("fromState");

  return looksLikeSubEntity ? "subEntityClass" : "plain";
}

function safeTypeArguments(
  type: ts.Type,
  ctx: ExtractContext,
): readonly ts.Type[] {
  try {
    return ctx.checker.getTypeArguments(type as ts.TypeReference);
  } catch {
    return [];
  }
}

function dedupeRefs(refs: TypeRef[]): TypeRef[] {
  const seen = new Set<string>();

  return refs.filter((ref) => {
    const key = `${ref.file}#${ref.symbol}|${ref.arity}|${ref.via}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function relativeToRoot(root: string, file: string): string {
  const prefix = root.endsWith("/") ? root : `${root}/`;
  return (file.startsWith(prefix) ? file.slice(prefix.length) : file)
    .split("\\")
    .join("/");
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
  if (ts.isLiteralTypeNode(typeNode) && ts.isStringLiteral(typeNode.literal)) {
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
