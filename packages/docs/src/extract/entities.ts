import ts from "typescript";

import type { EntityNode, Method } from "./model";
import { makeNodeId } from "./model";
import {
  collectNewExpressionNames,
  eachSourceFile,
  heritageOf,
  isStatic,
  locationOf,
  membersOfTypeNode,
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

  const entity: EntityNode = {
    id: makeNodeId(kind, location.file, name),
    kind,
    name,
    stateTypeName,
    stateFields: membersOfTypeNode(heritage?.typeArguments?.[0], ctx),
    methods: node.members
      .filter(ts.isMethodDeclaration)
      .map((m) => toMethod(m, ctx)),
    invariants,
    invariantAttachment: attachment,
    location,
  };

  if (serializedTypeName !== undefined) {
    entity.serializedTypeName = serializedTypeName;
  }

  return entity;
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
 * Three shapes exist in the wild and all three must be read:
 *   1. `this.addInvariant(x)` in the constructor        — the documented form
 *   2. `super(id, state, { invariants: [x, y] })`       — 1.7.0 options object
 *   3. `super(id, state, [x, y])`                       — the pre-1.7 array
 *
 * A fourth exists — `entity.addInvariant(x)` from a static factory, outside the
 * class body — which this deliberately does not chase; it is confined to the
 * library's own unit tests.
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

      // super(id, state, <third argument>)
      if (callee.kind === ts.SyntaxKind.SuperKeyword) {
        const third = n.arguments[2];

        if (third && ts.isArrayLiteralExpression(third)) {
          names.push(...third.elements.map((e) => e.getText(sf)));
          attachment = "positionalArray";
        }

        if (third && ts.isObjectLiteralExpression(third)) {
          for (const prop of third.properties) {
            if (
              ts.isPropertyAssignment(prop) &&
              prop.name.getText(sf) === "invariants" &&
              ts.isArrayLiteralExpression(prop.initializer)
            ) {
              names.push(
                ...prop.initializer.elements.map((e) => e.getText(sf)),
              );
              attachment = "optionsObject";
            }
          }
        }
      }
    }

    ts.forEachChild(n, visit);
  };

  visit(ctor.body);

  void ctx;
  return { invariants: dedupe(names), attachment };
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}
