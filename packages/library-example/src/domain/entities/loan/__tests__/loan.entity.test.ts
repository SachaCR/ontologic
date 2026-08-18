import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Loan, type LoanState } from "../loan.entity";

const bookCopyId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const memberId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

afterEach(() => {
  vi.useRealTimers();
});

describe("Given I have a member and a book copy to lend out", () => {
  describe("When I open a standard loan at a known moment in time", () => {
    let loan: Loan;
    let event: ReturnType<typeof Loan.create>["event"];

    const expectedLoanDate = "2025-03-15T12:00:00.000Z";
    const expectedDueDate = (() => {
      const d = new Date("2025-03-15T12:00:00.000Z");
      d.setUTCDate(d.getUTCDate() + 21);
      return d.toISOString();
    })();

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-03-15T12:00:00.000Z"));
      const created = Loan.create({ bookId: bookCopyId, memberId });
      loan = created.loan;
      event = created.event;
    });

    it("Then the loan ties the copy to the borrowing member", () => {
      expect(loan.readState().bookId).toBe(bookCopyId);
      expect(loan.readState().memberId).toBe(memberId);
    });

    it("Then the loan records today as the loan date and a due date three weeks ahead", () => {
      expect(loan.readState().loanDate).toBe(expectedLoanDate);
      expect(loan.readState().dueDate).toBe(expectedDueDate);
    });

    it("Then the loan is still open with no return timestamp", () => {
      expect(loan.readState().returnedAt).toBeNull();
    });

    it("Then a loan-created event mirrors those dates and identifiers", () => {
      expect(event.name).toBe("LOAN_CREATED");
      expect(event.version).toBe(1);
      expect(event.entityId).toBe(loan.id());
      expect(event.payload).toEqual({
        bookId: bookCopyId,
        memberId,
        loanDate: expectedLoanDate,
        dueDate: expectedDueDate,
      });
    });
  });
});

describe("Given I have an active loan on a copy", () => {
  let loan: Loan;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-01T09:30:00.000Z"));
    loan = Loan.create({ bookId: bookCopyId, memberId }).loan;
    vi.useRealTimers();
  });

  describe("When I record that the patron brought the book back", () => {
    const returnedAt = "2025-06-10T14:00:00.000Z";
    let outcome: ReturnType<Loan["returnBook"]>;

    beforeEach(() => {
      outcome = loan.returnBook(returnedAt);
    });

    it("Then I get a successful outcome with a loan-returned event", () => {
      expect(outcome.isOk()).toBe(true);
      if (outcome.isOk()) {
        expect(outcome.value.name).toBe("LOAN_RETURNED");
        expect(outcome.value.entityId).toBe(loan.id());
        expect(outcome.value.payload).toEqual({
          bookId: bookCopyId,
          memberId,
          returnedAt,
        });
      }
    });

    it("Then the loan shows the return time I recorded", () => {
      expect(loan.readState().returnedAt).toBe(returnedAt);
    });
  });
});

describe("Given I have already recorded the return of a loan", () => {
  let loan: Loan;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-04-01T08:00:00.000Z"));
    loan = Loan.create({ bookId: bookCopyId, memberId }).loan;
    vi.useRealTimers();
    loan.returnBook("2025-04-15T16:00:00.000Z");
  });

  describe("When I try to record another return for the same loan", () => {
    const secondReturnAttempt = "2025-04-20T10:00:00.000Z";
    let outcome: ReturnType<Loan["returnBook"]>;

    beforeEach(() => {
      outcome = loan.returnBook(secondReturnAttempt);
    });

    it("Then the library refuses because the loan was already returned", () => {
      expect(outcome.isErr()).toBe(true);
      if (outcome.isErr()) {
        expect(outcome.error.name).toBe("LOAN_ALREADY_RETURNED");
        expect(outcome.error.context).toEqual({ loanId: loan.id() });
      }
    });

    it("Then the original return timestamp is unchanged", () => {
      expect(loan.readState().returnedAt).toBe("2025-04-15T16:00:00.000Z");
    });
  });
});

describe("Given the library has a saved loan record (id and full snapshot)", () => {
  const savedLoanId = "cccccccc-cccc-cccc-cccc-cccccccccccc";
  const savedSnapshot: LoanState = {
    bookId: bookCopyId,
    memberId,
    loanDate: "2025-02-01T10:00:00.000Z",
    dueDate: "2025-02-22T10:00:00.000Z",
    returnedAt: null,
  };

  describe("When I load the loan back from that saved snapshot", () => {
    const loan = Loan.fromState(savedLoanId, savedSnapshot);

    it("Then the loan has the same identifier and lending details as when it was saved", () => {
      expect(loan.id()).toBe(savedLoanId);
      expect(loan.readState()).toEqual(savedSnapshot);
    });
  });
});

describe("Given a calendar instant when a loan begins", () => {
  describe("When I apply the standard lending period to compute the due date", () => {
    const loanStartsOn = new Date("2025-01-10T10:00:00.000Z");
    const { dueDate } = Loan.calculateDueDate(loanStartsOn);

    it("Then the due date is 21 UTC calendar days after the start", () => {
      const expected = new Date("2025-01-10T10:00:00.000Z");
      expected.setUTCDate(expected.getUTCDate() + 21);
      expect(dueDate.toISOString()).toBe(expected.toISOString());
    });
  });
});
