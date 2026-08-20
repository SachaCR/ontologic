import { describe, it, expect, beforeAll } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { extractModel } from "../index";
import type {
  DomainModel,
  EntityNode,
  EventNode,
  InvariantNode,
  ReadModelNode,
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

/** "Book.getById -> Loan.create => LoanCreatedEvent", for readable assertions. */
function pathsOf(model: DomainModel, name: string): string[] {
  return useCase(model, name).paths.map((path) => {
    const steps = path.steps.map((s) => s.name + "." + s.detail).join(" -> ");
    const outcome = namesOf(model, path.outcome).join(" + ");

    return (
      path.kind + ": " + (steps || "(none)") + " => " + (outcome || "(none)")
    );
  });
}

function useCase(model: DomainModel, name: string): UseCaseNode {
  const found = model.nodes.find(
    (n) => n.kind === "useCase" && n.name === name,
  );
  if (!found) throw new Error(`no use case named ${name}`);
  return found as UseCaseNode;
}

function readModel(model: DomainModel, name: string): ReadModelNode {
  const found = model.nodes.find(
    (n) => n.kind === "readModel" && n.name === name,
  );
  if (!found) throw new Error(`no read model named ${name}`);
  return found as ReadModelNode;
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

      expect(order.location.file).toBe("domain/entities/order/order.entity.ts");
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

      expect(invariants.map((i) => [i.name, i.description]).sort()).toEqual([
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
      const pay = useCase(model, "PayOrderUseCase");

      expect(pay.reads).toEqual(["OrderRepository"]);
      expect(pay.writes).toEqual(["OrderRepository"]);
      expect(namesOf(model, pay.canFail).sort()).toEqual([
        "EntityNotFound",
        "InvalidStatusTransition",
      ]);
    });

    it("Then a switch on error.name resolves to one guard, not several", () => {
      // `if (result.isErr()) { switch (...) { case: return err(...) } }` is one
      // position — the switch is an exhaustiveness assertion, not a branch.
      expect(pathsOf(model, "AddItemToOrderUseCase")).toEqual([
        "success: Order.getById -> Order.addItem -> Order.saveWithEvents " +
          "=> OrderItemAdded",
        "failure: Order.getById => EntityNotFound",
        "failure: Order.getById -> Order.addItem => InvalidStatusTransition",
      ]);
    });

    it("Then a use case names the command it is asked to carry out", () => {
      const pay = useCase(model, "PayOrderUseCase");

      expect(pay.actionKind).toBe("command");
      expect(pay.actionTypeName).toBe("PayOrderCommand");
      expect(pay.actionName).toBe("PAY_ORDER");
    });

    it("Then a use case that declares no failure reports none", () => {
      // CreateOrderUseCase declares `never` on the error side: it has no domain
      // failure mode, and that is an answer rather than a gap.
      const create = useCase(model, "CreateOrderUseCase");

      expect(create.canFail).toEqual([]);
      expect(create.writes).toEqual(["OrderRepository"]);
    });

    it("Then the aggregate it depends on is read off the constructor", () => {
      const pay = useCase(model, "PayOrderUseCase");

      expect(pay.dependencies).toEqual([
        { name: "orders", type: "OrderRepository" },
      ]);
    });

    it("Then nothing in this codebase is reported as an unmarked use case", () => {
      expect(
        model.findings.filter((f) => f.code === "use-case-not-marked"),
      ).toEqual([]);
    });
  });
});

describe("Given the CreditBalance example, which has both a command and a query", () => {
  let model: DomainModel;

  beforeAll(() => {
    model = extractModel({
      paths: [
        resolve(REPO_ROOT, "packages/ontologic/src/examples/creditBalance"),
      ],
    });
  });

  describe("When the domain model is extracted", () => {
    it("Then the repository edge is found through the constructor", () => {
      const debit = useCase(model, "DebitBalanceUseCase");

      expect(debit.reads).toEqual(["CreditBalanceRepository"]);
      expect(debit.writes).toEqual(["CreditBalanceRepository"]);
    });

    it("Then events accumulated into an array are all resolved", () => {
      // `const domainEvents = []; domainEvents.push(a); domainEvents.push(b);`
      // then handed to saveWithEvents as one batch.
      const create = useCase(model, "CreateBalanceWithCreditsUseCase");

      expect(namesOf(model, create.emits).sort()).toEqual([
        "CreditBalanceCreated",
        "CreditBalanceCredited",
      ]);
      expect(create.eventsUndetermined).toBe(false);
    });

    it("Then a read use case is reported as a query and writes nothing", () => {
      const read = useCase(model, "ReadBalanceUseCase");

      expect(read.actionKind).toBe("query");
      expect(read.actionName).toBe("READ_BALANCE");
      expect(read.reads).toEqual(["CreditBalanceRepository"]);
      expect(read.writes).toEqual([]);
    });
  });
});

describe("Given the CreditBalance example, whose event union is incomplete", () => {
  let model: DomainModel;

  beforeAll(() => {
    model = extractModel({
      paths: [
        resolve(REPO_ROOT, "packages/ontologic/src/examples/creditBalance"),
      ],
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
const LIBRARY_EXAMPLES = resolve(
  REPO_ROOT,
  "packages/library-example/src/domain",
);

describe.skipIf(!existsSync(LIBRARY_EXAMPLES))(
  "Given a codebase whose conventions differ from the library's own examples",
  () => {
    let model: DomainModel;

    beforeAll(() => {
      model = extractModel({ paths: [LIBRARY_EXAMPLES] });
    });

    describe("When the domain model is extracted", () => {
      it("Then the entities are still found", () => {
        // LibraryStats is the read side: a DomainEntity the stats projection
        // folds events into. It is an entity like the other two, and none of the
        // three is an aggregate — nothing in this example holds anything.
        const names = model.nodes
          .filter((n) => n.kind === "entity")
          .map((n) => n.name)
          .sort();

        expect(names).toEqual(["Book", "LibraryStats", "Loan"]);
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

      it("Then no domain error is flagged for the broken instanceof", () => {
        // Every error class here restores its prototype. The detection itself
        // is covered by fixtures/brokenPrototype.ts, since nothing in this
        // repository omits `setPrototypeOf` any more.
        const flagged = model.findings.filter(
          (f) => f.code === "error-missing-set-prototype",
        );
        const errorCount = model.nodes.filter((n) => n.kind === "error").length;

        expect(errorCount).toBe(7);
        expect(flagged).toEqual([]);
      });

      it("Then nothing is flagged for the pre-1.7 invariant API", () => {
        // Upgraded to the options object when it joined the workspace.
        expect(
          model.findings.filter(
            (f) => f.code === "legacy-invariant-attachment",
          ),
        ).toEqual([]);
      });

      it("Then a repository query type is not mistaken for an event union", () => {
        // BookSearchCriteria and the like are type aliases too, and must not be
        // counted. LibraryEvent is kept because its members really are events —
        // it is the vocabulary the stats read model declares.
        expect(model.eventUnions.map((u) => u.name).sort()).toEqual([
          "BookEvent",
          "LibraryEvent",
          "LoanEvent",
        ]);
      });

      it("Then a cross-aggregate use case shows it reads two and writes one", () => {
        const register = useCase(model, "RegisterLoanUseCase");

        expect(register.reads.sort()).toEqual([
          "LibraryCollection",
          "LoanRegister",
        ]);
        expect(register.writes).toEqual(["LoanRegister"]);
      });

      it("Then the failures come from the declared union, not the call sites", () => {
        const register = useCase(model, "RegisterLoanUseCase");

        expect(namesOf(model, register.canFail).sort()).toEqual([
          "BookAlreadyOnLoanError",
          "BookLostCannotBeLoanedError",
          "BookNotFoundError",
          "MemberActiveLoanLimitExceededError",
        ]);
      });

      it("Then no use case erases its error union any more", () => {
        // Declaring `Result<T, Error>` stopped compiling when `UseCase`
        // constrained the error side to `DomainError`.
        expect(
          model.findings.filter(
            (f) => f.code === "use-case-error-union-erased",
          ),
        ).toEqual([]);
      });

      it("Then the reads are reported as queries and the writes as commands", () => {
        const kindOf = (name: string): string =>
          useCase(model, name).actionKind;

        expect(kindOf("SearchBooksUseCase")).toBe("query");
        expect(kindOf("ListOutstandingLoansForMemberUseCase")).toBe("query");
        expect(kindOf("RegisterLoanUseCase")).toBe("command");
        expect(kindOf("RecordBookReturnUseCase")).toBe("command");
      });

      it("Then a use case reports only the events it actually causes", () => {
        // RegisterLoan reads the Book aggregate but never writes it, so none of
        // Book's events belong to it. Reporting the written aggregate's whole
        // repertoire is the over-reporting this replaced.
        const register = useCase(model, "RegisterLoanUseCase");

        expect(namesOf(model, register.emits)).toEqual(["LoanCreatedEvent"]);
        expect(register.eventsUndetermined).toBe(false);
      });

      it("Then an event destructured from a static factory is resolved", () => {
        // `const { book, event } = Book.create(...)` — the property name is not
        // stable across codebases, so this resolves through the factory call.
        const addBook = useCase(model, "AddBookUseCase");

        expect(namesOf(model, addBook.emits)).toEqual(["BookCreatedEvent"]);
      });

      it("Then an event unwrapped from a Result is resolved", () => {
        const declareLost = useCase(model, "DeclareBookLostUseCase");

        expect(namesOf(model, declareLost.emits)).toEqual(["BookLostEvent"]);
      });

      it("Then a query emits nothing, and says so rather than failing to tell", () => {
        const search = useCase(model, "SearchBooksUseCase");

        expect(search.emits).toEqual([]);
        expect(search.eventsUndetermined).toBe(false);
      });

      it("Then nothing in this codebase has undetermined events", () => {
        expect(
          model.findings.filter(
            (f) => f.code === "use-case-events-undetermined",
          ),
        ).toEqual([]);
      });

      it("Then each failure path stops at the step that refused it", () => {
        // The prefixes must differ. If they did not, this would just be
        // `canFail` in a row, which is what the board replaced.
        expect(pathsOf(model, "RegisterLoanUseCase")).toEqual([
          "success: Book.getById -> Loan.findOutstandingLoanForBook -> " +
            "Loan.findActiveLoansForMember -> Loan.create -> Loan.saveWithEvents " +
            "=> LoanCreatedEvent",
          "failure: Book.getById => BookNotFoundError",
          "failure: Book.getById => BookLostCannotBeLoanedError",
          "failure: Book.getById -> Loan.findOutstandingLoanForBook " +
            "=> BookAlreadyOnLoanError",
          "failure: Book.getById -> Loan.findOutstandingLoanForBook -> " +
            "Loan.findActiveLoansForMember => MemberActiveLoanLimitExceededError",
        ]);
      });

      it("Then an error propagated from an entity method is attributed to that call", () => {
        // `return err(lostOutcome.error)` — the error is never named in the use
        // case, only in the method's declared Result.
        expect(pathsOf(model, "DeclareBookLostUseCase")).toEqual([
          "success: Book.getById -> Book.declareLost -> Book.saveWithEvents " +
            "=> BookLostEvent",
          "failure: Book.getById => BookNotFoundError",
          "failure: Book.getById -> Book.declareLost => BookAlreadyDeclaredLostError",
        ]);
      });

      it("Then a query has one path and no failure", () => {
        expect(pathsOf(model, "SearchBooksUseCase")).toEqual([
          "success: Book.searchBook => (none)",
        ]);
      });

      it("Then no use case is left unmarked", () => {
        expect(
          model.findings.filter((f) => f.code === "use-case-not-marked"),
        ).toEqual([]);
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

describe("Given a use case propagating a multi-error entity method", () => {
  let model: DomainModel;

  beforeAll(() => {
    model = extractModel({
      paths: [resolve(__dirname, "fixtures/multiErrorGuard.ts")],
      includeTests: true,
    });
  });

  describe("When the domain model is extracted", () => {
    it("Then both errors leave from the same step", () => {
      expect(pathsOf(model, "EmptyBasketUseCase")).toEqual([
        "success: Basket.getById -> Basket.empty -> Basket.saveWithEvents " +
          "=> BasketEmptied",
        "failure: Basket.getById => BasketNotFound",
        "failure: Basket.getById -> Basket.empty " +
          "=> BasketLocked + BasketAlreadyEmpty",
      ]);
    });
  });
});

describe("Given a use case that builds its own event", () => {
  let model: DomainModel;

  beforeAll(() => {
    model = extractModel({
      paths: [resolve(__dirname, "fixtures/eventFromUseCase.ts")],
      includeTests: true,
    });
  });

  describe("When the domain model is extracted", () => {
    it("Then the event it constructs is reported as emitted", () => {
      const open = useCase(model, "OpenAccountViaReferralUseCase");

      expect(namesOf(model, open.emits)).toEqual(["ReferralAccountOpened"]);
      expect(open.eventsUndetermined).toBe(false);
    });
  });
});

describe("Given a use case whose event is built by a helper", () => {
  let model: DomainModel;

  beforeAll(() => {
    model = extractModel({
      paths: [resolve(__dirname, "fixtures/untraceableEvents.ts")],
      includeTests: true,
    });
  });

  describe("When the domain model is extracted", () => {
    it("Then it is reported as undetermined rather than as emitting nothing", () => {
      const escalate = useCase(model, "EscalateTicketUseCase");

      expect(escalate.emits).toEqual([]);
      expect(escalate.eventsUndetermined).toBe(true);
    });

    it("Then the gap is surfaced as a finding", () => {
      const flagged = model.findings.filter(
        (f) => f.code === "use-case-events-undetermined",
      );

      expect(
        namesOf(
          model,
          flagged.map((f) => f.nodeId),
        ),
      ).toEqual(["EscalateTicketUseCase"]);
    });
  });
});

describe("Given an error class that never restores its prototype", () => {
  let model: DomainModel;

  beforeAll(() => {
    model = extractModel({
      paths: [resolve(__dirname, "fixtures/brokenPrototype.ts")],
      includeTests: true,
    });
  });

  describe("When the domain model is extracted", () => {
    it("Then only the class missing setPrototypeOf is flagged", () => {
      const flagged = model.findings.filter(
        (f) => f.code === "error-missing-set-prototype",
      );

      expect(
        namesOf(
          model,
          flagged.map((f) => f.nodeId),
        ),
      ).toEqual(["BrokenPrototypeError"]);
    });

    it("Then the class that restores it is recorded as sound", () => {
      const restored = model.nodes.find(
        (n) => n.kind === "error" && n.name === "RestoredPrototypeError",
      );

      expect(restored).toBeDefined();
      expect((restored as { setsPrototype: boolean }).setsPrototype).toBe(true);
    });
  });
});

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

      expect(
        namesOf(
          model,
          flagged.map((f) => f.nodeId),
        ),
      ).toEqual(["LegacyAggregate"]);
    });
  });
});

describe("Given a codebase with event consumers of every shape", () => {
  let model: DomainModel;

  beforeAll(() => {
    model = extractModel({
      paths: [resolve(__dirname, "fixtures/readModel.ts")],
    });
  });

  describe("When read models are extracted", () => {
    it("Then a declared read model records what it listens for", () => {
      const view = readModel(model, "ShelfOccupancy");

      expect(view.consumedEventNames).toEqual(["SHELF_FILLED", "SHELF_CLEARED"]);
      expect(view.consumesEverything).toBe(false);
      expect(view.queries.map((q) => q.name)).toEqual(["countOccupied"]);
    });

    it("Then subscriptions become edges to the events themselves", () => {
      const view = readModel(model, "ShelfOccupancy");

      const consumed = model.edges
        .filter((e) => e.kind === "consumes" && e.from === view.id)
        .map((e) => model.nodes.find((n) => n.id === e.to)?.name)
        .sort();

      expect(consumed).toEqual(["ShelfCleared", "ShelfFilled"]);
    });

    it("Then what it may hear is kept apart from what it does hear", () => {
      // The union admits three events and only two handlers are registered.
      // Collapsing the two would report a subscription that does not exist.
      const view = readModel(model, "ShelfOccupancy");

      expect(view.declaredEventNames).toEqual([
        "ShelfCleared",
        "ShelfFilled",
        "ShelfPainted",
      ]);
      expect(view.consumedEventNames).toHaveLength(2);
    });

    it("Then a subscriber that never declares itself is reported, not guessed at", () => {
      // A listenTo call proves a subscription, not that a view is being built —
      // one of these logs and the other is a script.
      const reported = model.findings
        .filter((f) => f.code === "read-model-not-declared")
        .map((f) => f.message);

      expect(reported).toHaveLength(2);
      expect(reported.join("")).toContain("ShelfAuditLog");
      expect(reported.join("")).toContain("watchEverything");

      expect(
        model.nodes.some((n) => n.kind === "readModel" && n.name === "ShelfAuditLog"),
      ).toBe(false);
    });

    it("Then listening for an event nothing publishes is a finding", () => {
      // Reached through a cast here; in a real codebase it is usually a read
      // model listening to another bounded context, whose events are not in
      // the analysed directory.
      const finding = model.findings.find(
        (f) => f.code === "read-model-consumes-unknown-event",
      );

      expect(finding?.message).toContain("SHELF_CLEANED");
    });
  });
});
