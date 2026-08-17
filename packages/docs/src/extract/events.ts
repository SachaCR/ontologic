import ts from "typescript";

import type { EventNode, EventUnion } from "./model";
import { makeNodeId } from "./model";
import {
  eachSourceFile,
  heritageOf,
  literalNumberOfTypeNode,
  literalStringOfTypeNode,
  locationOf,
  membersOfTypeNode,
  typeArgText,
  unionMembers,
  type ExtractContext,
} from "./ts-utils";

/**
 * Domain events: `class X extends DomainEvent<Name, Version, Payload>`.
 *
 * The wire name and version come from the **type arguments**, not from the
 * `super({ name: … })` call. They agree in every corpus, but the type arguments
 * are what the rest of the type system sees, and one event in the wild builds
 * its payload internally from `entityId` alone — so the call site is not always
 * informative.
 */
export function extractEvents(ctx: ExtractContext): {
  events: EventNode[];
  unions: EventUnion[];
} {
  const events: EventNode[] = [];
  const unions: EventUnion[] = [];

  eachSourceFile(ctx, (sf) => {
    sf.forEachChild((node) => {
      if (ts.isClassDeclaration(node) && node.name) {
        const event = toEventNode(node, ctx);
        if (event) events.push(event);
        return;
      }

      // Event unions: `export type OrderEvent = OrderCreated | OrderPaid;`
      // Declared in a dedicated file in some codebases and inline in the entity
      // file in others, so match on shape rather than location.
      if (ts.isTypeAliasDeclaration(node)) {
        const members = unionMembers(node.type);
        if (members.length === 0) return;

        unions.push({
          name: node.name.text,
          memberNames: members,
          location: locationOf(node, ctx.root),
        });
      }
    });
  });

  return { events, unions };
}

function toEventNode(
  node: ts.ClassDeclaration,
  ctx: ExtractContext,
): EventNode | undefined {
  const heritage = heritageOf(node);
  if (!heritage || heritage.baseName !== "DomainEvent") return undefined;

  const sf = node.getSourceFile();
  const name = node.name?.text;
  if (!name) return undefined;

  const location = locationOf(node, ctx.root);

  const eventName =
    literalStringOfTypeNode(heritage.typeArguments?.[0], ctx) ??
    typeArgText(heritage.typeArguments, 0, sf) ??
    name;

  const version = literalNumberOfTypeNode(heritage.typeArguments?.[1]) ?? 1;
  const payloadTypeName = typeArgText(heritage.typeArguments, 2, sf) ?? "unknown";

  return {
    id: makeNodeId("event", location.file, name),
    kind: "event",
    name,
    eventName,
    version,
    payloadTypeName,
    payloadFields: membersOfTypeNode(heritage.typeArguments?.[2], ctx),
    location,
  };
}
