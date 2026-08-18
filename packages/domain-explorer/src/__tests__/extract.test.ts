import { describe, it, expect, beforeAll } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { extractModel } from "../index";
import type {
  DomainModel,
  EntityNode,
  EventNode,
  InvariantNode,
  RepositoryNode,
  UseCaseNode,
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

function useCase(model: DomainModel, name: string): UseCaseNode {
  const found = model.nodes.find((n) => n.kind === "useCase" && n.name === name);
  if (!found) throw new Error(`no use case named ${name}`);
  return found as UseCaseNode;
}

function repository(model: DomainModel, name: string): RepositoryNode {
  const found = model.nodes.find(
    (n) => n.kind === "repository" && n.name === name,
  );
  if (!found) throw new Error(`no repository named ${name}`);
  return found as RepositoryNode;
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
      paths: [resolve(REPO_ROOT, "packages/ontologic/src/examples/order")],
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
      expect(namesOf(model, order.invariants)).toEqual([
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

describe("Given the Order example's application layer", () => {
  let model: DomainModel;

  beforeAll(() => {
    model = extractModel({
      paths: [resolve(REPO_ROOT, "packages/ontologic/src/examples/order")],
    });
  });

  describe("When the domain model is extracted", () => {
    it("Then the invariants carry their human-readable description", () => {
      const invariants = model.nodes.filter(
        (n): n is InvariantNode => n.kind === "invariant",
      );

      expect(
        invariants.map((i) => [i.name, i.description]).sort(),
      ).toEqual([
        ["orderHasAtLeastOneItemInvariant", "Order Has At Least One Item"],
        ["paidOrderHasInvoiceIdInvariant", "Paid Order Has Invoice Id"],
      ]);
    });

    it("Then an entity links to the invariants protecting it", () => {
      const order = entity(model, "Order");

      expect(namesOf(model, order.invariants)).toEqual([
        "orderHasAtLeastOneItemInvariant",
        "paidOrderHasInvoiceIdInvariant",
      ]);
    });

    it("Then the repository is linked to the aggregate it persists", () => {
      const orders = repository(model, "OrderRepository");
      const order = entity(model, "Order");

      expect(orders.entityTypeName).toBe("Order");
      expect(model.edges).toContainEqual({
        from: orders.id,
        to: order.id,
        kind: "persists",
      });
    });

    it("Then a use case reports the aggregate it reads and writes", () => {
      const pay = useCase(model, "payOrderUseCase");

      expect(pay.confidence).toBe("high");
      expect(pay.reads).toEqual(["OrderRepository"]);
      expect(pay.writes).toEqual(["OrderRepository"]);
      expect(namesOf(model, pay.canFail).sort()).toEqual([
        "EntityNotFound",
        "InvalidStatusTransition",
      ]);
    });

    it("Then a use case with no Result return type is still found", () => {
      // createOrderUseCase returns a bare Promise<OrderState>: it has no domain
      // failure mode, so there is no Result to key on.
      const create = useCase(model, "createOrderUseCase");

      expect(create.confidence).toBe("medium");
      expect(create.writes).toEqual(["OrderRepository"]);
    });
  });
});

describe("Given a codebase whose repository is a module-level singleton", () => {
  let model: DomainModel;

  beforeAll(() => {
    model = extractModel({
      paths: [resolve(REPO_ROOT, "packages/ontologic/src/examples/creditBalance")],
    });
  });

  describe("When the domain model is extracted", () => {
    it("Then the repository edge is found even though it is not a parameter", () => {
      const debit = useCase(model, "debitBalanceUseCase");

      expect(debit.parameters.map((p) => p.type)).not.toContain(
        "CreditBalanceRepository",
      );
      expect(debit.reads).toEqual(["CreditBalanceRepository"]);
      expect(debit.writes).toEqual(["CreditBalanceRepository"]);
    });
  });
});

describe("Given the CreditBalance example, whose event union is incomplete", () => {
  let model: DomainModel;

  beforeAll(() => {
    model = extractModel({
      paths: [resolve(REPO_ROOT, "packages/ontologic/src/examples/creditBalance")],
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
          "packages/ontologic/agents/skills/ontologic-templates/templates/src/domain",
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

// The library example is a workspace package now, so this runs in CI rather than
// depending on a sibling checkout. It still exercises the important case: a
// codebase whose own conventions differ from the library's own examples.
const LIBRARY_EXAMPLES = resolve(REPO_ROOT, "packages/library-example/src/domain");

describe.skipIf(!existsSync(LIBRARY_EXAMPLES))(
  "Given a codebase whose conventions differ from the library's own examples",
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

      it("Then invariants passed through the options object are detected", () => {
        const loan = entity(model, "Loan");

        expect(loan.invariantAttachment).toBe("optionsObject");
        expect(namesOf(model, loan.invariants)).toEqual([
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

      it("Then nothing is flagged for the pre-1.7 invariant API", () => {
        // Upgraded to the options object when it joined the workspace.
        expect(
          model.findings.filter((f) => f.code === "legacy-invariant-attachment"),
        ).toEqual([]);
      });

      it("Then a repository query type is not mistaken for an event union", () => {
        expect(model.eventUnions.map((u) => u.name).sort()).toEqual([
          "BookEvent",
          "LoanEvent",
        ]);
      });

      it("Then a cross-aggregate use case shows it reads two and writes one", () => {
        const register = useCase(model, "registerLoan");

        expect(register.reads.sort()).toEqual([
          "LibraryCollection",
          "LoanRegister",
        ]);
        expect(register.writes).toEqual(["LoanRegister"]);
      });

      it("Then the failures are recovered even though the error union is erased", () => {
        const register = useCase(model, "registerLoan");

        // The signature says Result<LoanState, Error>; the errors are only
        // visible at the err(new X(...)) call sites.
        expect(register.returnType).toContain("Error");
        expect(namesOf(model, register.canFail).sort()).toEqual([
          "BookAlreadyOnLoanError",
          "BookLostCannotBeLoanedError",
          "BookNotFoundError",
          "MemberActiveLoanLimitExceededError",
        ]);
      });

      it("Then every use case is flagged for erasing its error union", () => {
        const flagged = model.findings.filter(
          (f) => f.code === "use-case-error-union-erased",
        );

        expect(flagged).toHaveLength(6);
      });

      it("Then the repository domain queries are captured", () => {
        const loans = repository(model, "LoanRegister");

        expect(loans.finders.map((f) => f.name).sort()).toEqual([
          "findActiveLoansForMember",
          "findOutstandingLoanForBook",
        ]);
      });
    });
  },
);

describe("Given a codebase still on the pre-1.7 invariant API", () => {
  let model: DomainModel;

  beforeAll(() => {
    model = extractModel({
      paths: [resolve(__dirname, "fixtures/legacyInvariants.ts")],
      includeTests: true,
    });
  });

  describe("When the domain model is extracted", () => {
    it("Then the positional invariant array is still detected", () => {
      const legacy = entity(model, "LegacyAggregate");

      expect(legacy.invariantAttachment).toBe("positionalArray");
      expect(namesOf(model, legacy.invariants)).toEqual(["amountIsPositive"]);
    });

    it("Then it is flagged as the legacy API", () => {
      const flagged = model.findings.filter(
        (f) => f.code === "legacy-invariant-attachment",
      );

      expect(namesOf(model, flagged.map((f) => f.nodeId))).toEqual([
        "LegacyAggregate",
      ]);
    });
  });
});
