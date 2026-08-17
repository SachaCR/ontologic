import { describe, it, expect, beforeAll } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { extractModel } from "../index";
import type {
  DomainModel,
  EntityNode,
  EventNode,
} from "../extract/model";

const REPO_ROOT = resolve(__dirname, "..", "..", "..", "..");

function entity(model: DomainModel, name: string): EntityNode {
  const found = model.nodes.find(
    (n) => (n.kind === "entity" || n.kind === "valueObject") && n.name === name,
  );
  if (!found) throw new Error(`no entity named ${name}`);
  return found as EntityNode;
}

function event(model: DomainModel, name: string): EventNode {
  const found = model.nodes.find((n) => n.kind === "event" && n.name === name);
  if (!found) throw new Error(`no event named ${name}`);
  return found as EventNode;
}

/** Node ids are module-qualified; assert on the readable names they point at. */
function namesOf(model: DomainModel, ids: string[]): string[] {
  return ids.map((id) => {
    const node = model.nodes.find((n) => n.id === id);
    if (!node) throw new Error(`dangling node id: ${id}`);
    return node.name;
  });
}

describe("Given the library's own Order example", () => {
  let model: DomainModel;

  beforeAll(() => {
    model = extractModel({
      paths: [resolve(REPO_ROOT, "src/examples/order")],
    });
  });

  describe("When the domain model is extracted", () => {
    it("Then the Order aggregate is found with its state", () => {
      const order = entity(model, "Order");

      expect(order.kind).toBe("entity");
      expect(order.stateTypeName).toBe("OrderState");
      expect(order.stateFields.map((f) => f.name)).toEqual([
        "id",
        "customerId",
        "status",
        "items",
        "voucherId",
        "invoiceId",
      ]);
    });

    it("Then optional state fields are marked optional", () => {
      const order = entity(model, "Order");
      const invoiceId = order.stateFields.find((f) => f.name === "invoiceId");

      expect(invoiceId?.optional).toBe(true);
      expect(invoiceId?.type).toBe("string");
    });

    it("Then a behaviour method reports the event it emits and how it can fail", () => {
      const pay = entity(model, "Order").methods.find((m) => m.name === "pay");

      expect(namesOf(model, pay?.emits ?? [])).toEqual(["OrderPaid"]);
      expect(namesOf(model, pay?.canFail ?? [])).toEqual([
        "InvalidStatusTransition",
      ]);
    });

    it("Then a method with several failure modes reports all of them", () => {
      const removeItem = entity(model, "Order").methods.find(
        (m) => m.name === "removeItem",
      );

      expect(namesOf(model, removeItem?.canFail ?? []).sort()).toEqual([
        "InvalidStatusTransition",
        "OrderMustHaveAtLeastOneItem",
      ]);
    });

    it("Then the creation factory reports only the creation event, not the aggregate", () => {
      const create = entity(model, "Order").methods.find(
        (m) => m.name === "create",
      );

      expect(create?.isStatic).toBe(true);
      // `create` returns `{ order: Order; creationEvent: OrderCreated }`, so a
      // naive reading of the return type would call `Order` an emitted event.
      expect(namesOf(model, create?.emits ?? [])).toEqual(["OrderCreated"]);
    });

    it("Then rehydration emits nothing", () => {
      const fromState = entity(model, "Order").methods.find(
        (m) => m.name === "fromState",
      );

      expect(fromState?.emits).toEqual([]);
    });

    it("Then edges are recorded with the method that produced them", () => {
      const order = entity(model, "Order");
      const paid = event(model, "OrderPaid");

      expect(model.edges).toContainEqual({
        from: order.id,
        to: paid.id,
        kind: "emits",
        via: "pay",
      });
    });

    it("Then only the analysed codebase is documented, not its dependencies", () => {
      // The program follows imports into the library itself; none of its
      // internal type aliases should appear as domain event unions.
      const names = model.eventUnions.map((u) => u.name);

      expect(names).toContain("OrderEvent");
      expect(names).not.toContain("Result");
      expect(names).not.toContain("WorkflowStatus");
    });

    it("Then the invariants attached in the constructor are recorded", () => {
      const order = entity(model, "Order");

      expect(order.invariantAttachment).toBe("addInvariant");
      expect(order.invariants).toEqual([
        "orderHasAtLeastOneItemInvariant",
        "paidOrderHasInvoiceIdInvariant",
      ]);
    });

    it("Then each domain event carries its wire name, version and payload", () => {
      const paid = event(model, "OrderPaid");

      expect(paid.eventName).toBe("ORDER_PAID");
      expect(paid.version).toBe(1);
      expect(paid.payloadTypeName).toBe("OrderPaidPayload");
      expect(paid.payloadFields.map((f) => f.name).sort()).toEqual([
        "invoiceId",
        "status",
      ]);
    });

    it("Then the aggregate's event union is captured", () => {
      const union = model.eventUnions.find((u) => u.name === "OrderEvent");

      expect(union?.memberNames).toEqual([
        "OrderCreated",
        "OrderItemAdded",
        "OrderItemRemoved",
        "VoucherApplied",
        "OrderPlaced",
        "OrderPaid",
      ]);
    });

    it("Then every concept records where it was found", () => {
      const order = entity(model, "Order");

      expect(order.location.file).toBe(
        "domain/entities/order/order.entity.ts",
      );
      expect(order.location.line).toBeGreaterThan(0);
    });
  });
});

describe("Given the CreditBalance example, whose event union is incomplete", () => {
  let model: DomainModel;

  beforeAll(() => {
    model = extractModel({
      paths: [resolve(REPO_ROOT, "src/examples/creditBalance")],
    });
  });

  describe("When the domain model is extracted", () => {
    it("Then the events absent from the union are reported", () => {
      const missing = model.findings
        .filter((f) => f.code === "event-missing-from-union")
        .map((f) => namesOf(model, [f.nodeId])[0])
        .sort();

      // CreditBalanceEvent lists three of the five events the entity emits.
      expect(missing).toEqual(["CreditLocked", "SubCreditReseted"]);
    });

    it("Then a type alias that is not an event union is not treated as one", () => {
      expect(model.eventUnions.map((u) => u.name)).toEqual([
        "CreditBalanceEvent",
      ]);
    });
  });
});

describe("Given the reference templates, which use a second aggregate", () => {
  let model: DomainModel;

  beforeAll(() => {
    model = extractModel({
      paths: [
        resolve(
          REPO_ROOT,
          "agents/skills/ontologic-templates/templates/src/domain",
        ),
      ],
    });
  });

  describe("When the domain model is extracted", () => {
    it("Then both aggregates are found", () => {
      const names = model.nodes
        .filter((n) => n.kind === "entity")
        .map((n) => n.name)
        .sort();

      expect(names).toEqual(["Plan", "Subscription"]);
    });

    it("Then an aggregate with no invariants reports none rather than failing", () => {
      const plan = entity(model, "Plan");

      expect(plan.invariants).toEqual([]);
      expect(plan.invariantAttachment).toBe("none");
    });

    it("Then a single-member event union is still captured", () => {
      const union = model.eventUnions.find((u) => u.name === "PlanEvent");

      expect(union?.memberNames).toEqual(["PlanCreated"]);
    });
  });
});

// The tool is meant to run on codebases it does not own, which may not have
// their dependencies installed and may pin an older Ontologic. library-examples
// is exactly that: no node_modules, and pinned to ^1.6.2 where invariants were
// a positional third constructor argument. Skipped when the sibling checkout is
// absent, so CI does not depend on it.
const LIBRARY_EXAMPLES = resolve(REPO_ROOT, "..", "library-examples/src/domain");

describe.skipIf(!existsSync(LIBRARY_EXAMPLES))(
  "Given a codebase with no dependencies installed and a pre-1.7 Ontologic",
  () => {
    let model: DomainModel;

    beforeAll(() => {
      model = extractModel({ paths: [LIBRARY_EXAMPLES] });
    });

    describe("When the domain model is extracted", () => {
      it("Then the aggregates are still found", () => {
        const names = model.nodes
          .filter((n) => n.kind === "entity")
          .map((n) => n.name)
          .sort();

        expect(names).toEqual(["Book", "Loan"]);
      });

      it("Then state fields resolve even though `ontologic` cannot", () => {
        const loan = entity(model, "Loan");

        expect(loan.stateFields.map((f) => f.name)).toEqual([
          "bookId",
          "memberId",
          "loanDate",
          "dueDate",
          "returnedAt",
        ]);
      });

      it("Then invariants passed as a positional array are still detected", () => {
        const loan = entity(model, "Loan");

        expect(loan.invariantAttachment).toBe("positionalArray");
        expect(loan.invariants).toEqual([
          "dueDateAfterLoanDate",
          "returnDateAfterLoanDate",
        ]);
      });

      it("Then an event union declared inside the entity file is captured", () => {
        const union = model.eventUnions.find((u) => u.name === "LoanEvent");

        expect(union?.memberNames).toEqual([
          "LoanCreatedEvent",
          "LoanReturnedEvent",
        ]);
      });

      it("Then an event that builds its own payload still reports its wire name", () => {
        const lost = event(model, "BookLostEvent");

        expect(lost.eventName).toBe("BOOK_LOST");
        expect(lost.version).toBe(1);
      });

      it("Then every domain error is flagged for the broken instanceof", () => {
        const flagged = model.findings.filter(
          (f) => f.code === "error-missing-set-prototype",
        );
        const errorCount = model.nodes.filter((n) => n.kind === "error").length;

        expect(errorCount).toBe(7);
        expect(flagged).toHaveLength(7);
      });

      it("Then the pre-1.7 invariant attachment is flagged", () => {
        const flagged = model.findings.filter(
          (f) => f.code === "legacy-invariant-attachment",
        );

        expect(namesOf(model, flagged.map((f) => f.nodeId))).toEqual(["Loan"]);
      });

      it("Then a repository query type is not mistaken for an event union", () => {
        expect(model.eventUnions.map((u) => u.name).sort()).toEqual([
          "BookEvent",
          "LoanEvent",
        ]);
      });
    });
  },
);
