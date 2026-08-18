import ts from "typescript";

import type { EntityNode, Method, TypeRef } from "./model";
import { makeNodeId } from "./model";
import {
  collectNewExpressionNames,
  eachSourceFile,
  heritageOf,
  isStatic,
  locationOf,
  membersOfTypeNode,
  resolveTypeRefs,
  typeArgText,
  unionMembers,
  unwrapResult,
  type ExtractContext,
} from "./ts-utils";

const ENTITY_BASE = "DomainEntity";
const VALUE_OBJECT_BASE = "ValueObject";

/**
 * Entities and value objects.
 *
 * The two share almost everything; the discriminator is the base class name
 * (and structurally, that a value object's constructor takes no id).
 */
export function extractEntities(ctx: ExtractContext): EntityNode[] {
  const entities: EntityNode[] = [];

  eachSourceFile(ctx, (sf) => {
    sf.forEachChild((node) => {
      if (!ts.isClassDeclaration(node) || !node.name) return;

      const heritage = heritageOf(node);
      if (!heritage) return;

      const kind =
        heritage.baseName === ENTITY_BASE
          ? "entity"
          : heritage.baseName === VALUE_OBJECT_BASE
            ? "valueObject"
            : undefined;

      if (!kind) return;

      entities.push(toEntityNode(node, kind, ctx));
    });
  });

  return entities;
}

function toEntityNode(
  node: ts.ClassDeclaration,
  kind: "entity" | "valueObject",
  ctx: ExtractContext,
): EntityNode {
  const sf = node.getSourceFile();
  const heritage = heritageOf(node);
  const name = node.name?.text ?? "(anonymous)";
  const location = locationOf(node, ctx.root);

  // A value object has no id, so its State is the FIRST type argument in both
  // cases — the shapes happen to line up.
  const stateTypeName = typeArgText(heritage?.typeArguments, 0, sf) ?? "unknown";
  const serializedTypeName = typeArgText(heritage?.typeArguments, 1, sf);

  const { invariants, attachment } = findInvariantAttachment(node, ctx);
  const stateFields = membersOfTypeNode(heritage?.typeArguments?.[0], ctx);

  const entity: EntityNode = {
    id: makeNodeId(kind, location.file, name),
    kind,
    name,
    stateTypeName,
    stateFields,
    methods: node.members
      .filter(ts.isMethodDeclaration)
      .map((m) => toMethod(m, ctx)),
    containedRefs: collectContainedRefs(node, stateFields, ctx),
    invariants,
    invariantAttachment: attachment,
    location,
  };

  if (serializedTypeName !== undefined) {
    entity.serializedTypeName = serializedTypeName;
  }

  return entity;
}

/**
 * Everything this class holds live, from both places it can hide.
 *
 * State fields are the obvious source. Private fields are the essential one: a
 * value object may keep the live instance in `#outputType` while storing only
 * `outputType.readState()` in its state, so a state-only pass finds none of the
 * value-object-to-value-object structure.
 *
 * Both are gated on resolving to a class or interface declaration, which is what
 * keeps infrastructure out — one value object in the wild holds a `graphlib`
 * `Graph` in a private field, and an ungated pass would render it as a domain
 * concept.
 */
function collectContainedRefs(
  node: ts.ClassDeclaration,
  stateFields: EntityNode["stateFields"],
  ctx: ExtractContext,
): TypeRef[] {
  const refs: TypeRef[] = stateFields.flatMap((field) => field.refs ?? []);

  for (const member of node.members) {
    if (!ts.isPropertyDeclaration(member)) continue;
    if (!member.type) continue;

    try {
      refs.push(
        ...resolveTypeRefs(
          ctx.checker.getTypeAtLocation(member.type),
          ctx,
          "privateField",
        ),
      );
    } catch {
      /* skip fields whose type will not resolve */
    }
  }

  const seen = new Set<string>();

  return refs.filter((ref) => {
    const key = `${ref.file}#${ref.symbol}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function toMethod(node: ts.MethodDeclaration, ctx: ExtractContext): Method {
  const sf = node.getSourceFile();
  const returnTypeNode = node.type;

  const emits: string[] = [];
  const canFail: string[] = [];

  // Preferred source: the declared return type. `Result<OrderPaid,
  // InvalidStatusTransition | VoucherAlreadyApplied>` names both edges exactly.
  const result = unwrapResult(returnTypeNode);

  if (result) {
    emits.push(...unionMembers(result.ok));
    canFail.push(...unionMembers(result.err));
  } else if (returnTypeNode) {
    // Some methods return a bare event with no Result wrapper, and static
    // factories return `{ order: Order; creationEvent: OrderCreated }`. Fall
    // back to reading type references out of the written return type.
    emits.push(...typeReferencesIn(returnTypeNode, sf));
  }

  // Last resort, and the only option when the return type is erased to `Error`
  // or absent entirely: what the body actually constructs.
  if (emits.length === 0 && canFail.length === 0 && node.body) {
    emits.push(...collectNewExpressionNames(node.body));
  }

  return {
    name: node.name.getText(sf),
    isStatic: isStatic(node),
    returnType: returnTypeNode
      ? returnTypeNode.getText(sf).replace(/\s+/g, " ")
      : inferredReturnType(node, ctx),
    parameters: node.parameters.map((p) => ({
      name: p.name.getText(sf),
      type: p.type ? p.type.getText(sf).replace(/\s+/g, " ") : "unknown",
    })),
    // Resolved to node ids in a later pass, once every node is known.
    emits: dedupe(emits),
    canFail: dedupe(canFail),
    location: locationOf(node, ctx.root),
  };
}

/** Type reference names appearing in a written type, e.g. inside an object literal type. */
function typeReferencesIn(typeNode: ts.TypeNode, sf: ts.SourceFile): string[] {
  const names: string[] = [];

  const visit = (n: ts.Node): void => {
    if (ts.isTypeReferenceNode(n)) {
      names.push(n.typeName.getText(sf));
    }
    ts.forEachChild(n, visit);
  };

  visit(typeNode);
  return names;
}

function inferredReturnType(
  node: ts.MethodDeclaration,
  ctx: ExtractContext,
): string {
  try {
    const signature = ctx.checker.getSignatureFromDeclaration(node);
    if (!signature) return "unknown";
    return ctx.checker.typeToString(
      ctx.checker.getReturnTypeOfSignature(signature),
    );
  } catch {
    return "unknown";
  }
}

/**
 * Which invariants are attached, and how.
 *
 * Several shapes exist in the wild and all must be read:
 *   1. `this.addInvariant(x)` in the constructor        — the documented form
 *   2. `super(id, state, { invariants: [x, y] })`       — 1.7.0 options object
 *   3. `super(state, { invariants: TOOL_INVARIANTS })`  — same, but a value
 *      object, so the options are the SECOND argument, and the list is an
 *      imported const rather than an inline array
 *   4. `super(id, state, [x, y])`                       — the pre-1.7 array
 *
 * Getting this wrong is expensive: a missed attachment makes every invariant on
 * the entity look dead, and the "declared but never attached" finding then fires
 * on rules that are in fact enforced.
 *
 * One shape is deliberately not chased — `entity.addInvariant(x)` from a static
 * factory, outside the class body — because it is confined to the library's own
 * unit tests.
 */
function findInvariantAttachment(
  node: ts.ClassDeclaration,
  ctx: ExtractContext,
): { invariants: string[]; attachment: EntityNode["invariantAttachment"] } {
  const sf = node.getSourceFile();
  const ctor = node.members.find(ts.isConstructorDeclaration);

  if (!ctor?.body) return { invariants: [], attachment: "none" };

  const names: string[] = [];
  let attachment: EntityNode["invariantAttachment"] = "none";

  const visit = (n: ts.Node): void => {
    if (ts.isCallExpression(n)) {
      const callee = n.expression;

      // this.addInvariant(x)
      if (
        ts.isPropertyAccessExpression(callee) &&
        callee.name.getText(sf) === "addInvariant"
      ) {
        const arg = n.arguments[0];
        if (arg) {
          names.push(arg.getText(sf));
          attachment = "addInvariant";
        }
      }

      if (callee.kind === ts.SyntaxKind.SuperKeyword) {
        // The options object sits at a different index for an entity
        // (id, state, options) than for a value object (state, options), so
        // scan the arguments rather than assuming a position.
        for (const argument of n.arguments) {
          if (!ts.isObjectLiteralExpression(argument)) continue;

          for (const property of argument.properties) {
            if (
              !ts.isPropertyAssignment(property) ||
              property.name.getText(sf) !== "invariants"
            ) {
              continue;
            }

            names.push(...resolveInvariantList(property.initializer, ctx));
            attachment = "optionsObject";
          }
        }

        // A bare array is only the legacy form, and only in the entity
        // position — anywhere else an array argument means something different.
        const third = n.arguments[2];
        if (third && ts.isArrayLiteralExpression(third)) {
          names.push(...third.elements.map((e) => e.getText(sf)));
          attachment = "positionalArray";
        }
      }
    }

    ts.forEachChild(n, visit);
  };

  visit(ctor.body);

  return { invariants: dedupe(names), attachment };
}

/**
 * The value of an `invariants:` property, as a list of invariant names.
 *
 * Written inline as `[a, b]`, or — commonly, once a codebase has more than a
 * couple — as a named const exported from a sibling module, which has to be
 * followed to its declaration.
 */
function resolveInvariantList(
  expression: ts.Expression,
  ctx: ExtractContext,
): string[] {
  if (ts.isArrayLiteralExpression(expression)) {
    return expression.elements.map((e) => qualify(e, ctx));
  }

  if (ts.isIdentifier(expression)) {
    const elements = resolveIdentifierToArray(expression, ctx);
    // Fall back to the identifier itself so the attachment is still recorded,
    // even when the declaration cannot be reached.
    return elements ?? [qualify(expression, ctx)];
  }

  return [];
}

/**
 * Qualify an invariant reference with the file it is declared in.
 *
 * Bare names are not unique: a codebase with several tool value objects will
 * declare `instructionsMustNotBeEmpty` once per tool, in sibling modules. A
 * name-only reference is then ambiguous and gets dropped, silently losing the
 * link. Following the symbol to its declaration makes it exact.
 */
function qualify(expression: ts.Node, ctx: ExtractContext): string {
  const text = expression.getText(expression.getSourceFile());
  if (!ts.isIdentifier(expression)) return text;

  const declaration = declarationOf(expression, ctx);
  if (!declaration) return text;

  const file = relativeTo(ctx.root, declaration.getSourceFile().fileName);
  return `${file}#${text}`;
}

function declarationOf(
  identifier: ts.Identifier,
  ctx: ExtractContext,
): ts.Declaration | undefined {
  try {
    const symbol = ctx.checker.getSymbolAtLocation(identifier);
    if (!symbol) return undefined;

    const resolved =
      symbol.flags & ts.SymbolFlags.Alias
        ? tryResolveAlias(symbol, ctx)
        : symbol;

    return resolved?.declarations?.[0];
  } catch {
    return undefined;
  }
}

/** Follow an identifier to a `const X = [a, b]` declaration, across modules. */
function resolveIdentifierToArray(
  identifier: ts.Identifier,
  ctx: ExtractContext,
): string[] | undefined {
  const declaration = declarationOf(identifier, ctx);
  if (!declaration || !ts.isVariableDeclaration(declaration)) return undefined;

  const initializer = declaration.initializer;
  if (!initializer || !ts.isArrayLiteralExpression(initializer)) {
    return undefined;
  }

  return initializer.elements.map((element) => qualify(element, ctx));
}

function relativeTo(root: string, file: string): string {
  const prefix = root.endsWith("/") ? root : `${root}/`;
  return (file.startsWith(prefix) ? file.slice(prefix.length) : file)
    .split("\\")
    .join("/");
}

function tryResolveAlias(
  symbol: ts.Symbol,
  ctx: ExtractContext,
): ts.Symbol | undefined {
  try {
    return ctx.checker.getAliasedSymbol(symbol);
  } catch {
    return symbol;
  }
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}
