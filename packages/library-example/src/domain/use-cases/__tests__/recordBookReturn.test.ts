import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RegisterLoanUseCase } from "../registerLoan.use-case";
import { RegisterLoanCommand } from "../commands/registerLoan.command";
import { RecordBookReturnUseCase } from "../recordBookReturn.use-case";
import { RecordBookReturnCommand } from "../commands/recordBookReturn.command";
import { LibraryCollection } from "../../repositories/libraryCollection.repository";
import { LoanRegister } from "../../repositories/loanRegister.repository";
import { addCopyToCatalog } from "./helpers";

afterEach(() => {
  vi.useRealTimers();
});

describe("Given an open loan exists in the register for a catalog copy", () => {
  let loanRegister: LoanRegister;
  let registerLoan: RegisterLoanUseCase;
  let recordBookReturn: RecordBookReturnUseCase;
  let loanId: string;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-09-01T09:00:00.000Z"));
    const collection = new LibraryCollection();
    loanRegister = new LoanRegister();
    registerLoan = new RegisterLoanUseCase(collection, loanRegister);
    recordBookReturn = new RecordBookReturnUseCase(loanRegister);
    const bookId = await addCopyToCatalog(collection, {
      isbn: "978-7777777777",
    });
    const registered = await registerLoan.execute(
      new RegisterLoanCommand({
        bookId,
        memberId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
      }),
    );
    expect(registered.isOk()).toBe(true);
    if (!registered.isOk()) return;
    const loans = await loanRegister.list({ limit: 20, offset: 0 });
    expect(loans.isOk()).toBe(true);
    if (!loans.isOk()) return;
    loanId = loans.value.data[0]!.id();
    vi.useRealTimers();
  });

  describe("When I record the return through the use case", () => {
    let outcome: Awaited<ReturnType<RecordBookReturnUseCase["execute"]>>;

    beforeEach(async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-09-14T17:30:00.000Z"));
      outcome = await recordBookReturn.execute(
        new RecordBookReturnCommand({ loanId }),
      );
      vi.useRealTimers();
    });

    it("Then the outcome succeeds and the loan shows the return time the use case chose", () => {
      expect(outcome.isOk()).toBe(true);
      if (outcome.isOk()) {
        expect(outcome.value.returnedAt).toBe("2025-09-14T17:30:00.000Z");
      }
    });
  });
});

describe("Given no loan exists for the id I am closing", () => {
  let loanRegister: LoanRegister;
  let recordBookReturn: RecordBookReturnUseCase;

  beforeEach(() => {
    loanRegister = new LoanRegister();
    recordBookReturn = new RecordBookReturnUseCase(loanRegister);
  });

  describe("When I try to record a return for that loan id", () => {
    const unknownLoanId = "dddddddd-dddd-dddd-dddd-dddddddddddd";
    let outcome: Awaited<ReturnType<RecordBookReturnUseCase["execute"]>>;

    beforeEach(async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-10-01T12:00:00.000Z"));
      outcome = await recordBookReturn.execute(
        new RecordBookReturnCommand({ loanId: unknownLoanId }),
      );
      vi.useRealTimers();
    });

    it("Then the use case reports that the loan was not found", () => {
      expect(outcome.isErr()).toBe(true);
      if (outcome.isErr()) {
        expect(outcome.error.name).toBe("LOAN_NOT_FOUND");
      }
    });
  });
});

describe("Given a loan has already been returned in the register", () => {
  let loanRegister: LoanRegister;
  let registerLoan: RegisterLoanUseCase;
  let recordBookReturn: RecordBookReturnUseCase;
  let loanId: string;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-11-01T08:00:00.000Z"));
    const collection = new LibraryCollection();
    loanRegister = new LoanRegister();
    registerLoan = new RegisterLoanUseCase(collection, loanRegister);
    recordBookReturn = new RecordBookReturnUseCase(loanRegister);
    const bookId = await addCopyToCatalog(collection, {
      isbn: "978-8888888888",
    });
    const registered = await registerLoan.execute(
      new RegisterLoanCommand({
        bookId,
        memberId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
      }),
    );
    expect(registered.isOk()).toBe(true);
    const loans = await loanRegister.list({ limit: 20, offset: 0 });
    expect(loans.isOk()).toBe(true);
    if (!loans.isOk()) return;
    loanId = loans.value.data[0]!.id();
    vi.setSystemTime(new Date("2025-11-05T08:00:00.000Z"));
    const firstReturn = await recordBookReturn.execute(
      new RecordBookReturnCommand({ loanId }),
    );
    expect(firstReturn.isOk()).toBe(true);
    vi.useRealTimers();
  });

  describe("When I try to record another return for the same loan", () => {
    let outcome: Awaited<ReturnType<RecordBookReturnUseCase["execute"]>>;

    beforeEach(async () => {
      outcome = await recordBookReturn.execute(
        new RecordBookReturnCommand({ loanId }),
      );
    });

    it("Then the use case refuses because the loan was already returned", () => {
      expect(outcome.isErr()).toBe(true);
      if (outcome.isErr()) {
        expect(outcome.error.name).toBe("LOAN_ALREADY_RETURNED");
      }
    });
  });
});
