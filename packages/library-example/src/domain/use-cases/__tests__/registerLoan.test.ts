import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DeclareBookLostUseCase } from "../declareBookLost.use-case";
import { DeclareBookLostCommand } from "../commands/declareBookLost.command";
import { RegisterLoanUseCase } from "../registerLoan.use-case";
import { RegisterLoanCommand } from "../commands/registerLoan.command";
import { RecordBookReturnUseCase } from "../recordBookReturn.use-case";
import { RecordBookReturnCommand } from "../commands/recordBookReturn.command";
import { MAX_ACTIVE_LOANS_PER_MEMBER } from "../../entities/loan/errors/loan.errors";
import { LibraryCollection } from "../../repositories/libraryCollection.repository";
import { LoanRegister } from "../../repositories/loanRegister.repository";
import { addCopyToCatalog } from "./helpers";

afterEach(() => {
  vi.useRealTimers();
});

describe("Given a copy is in the catalog, available to lend, with no open loan on it", () => {
  let collection: LibraryCollection;
  let loanRegister: LoanRegister;
  let registerLoan: RegisterLoanUseCase;
  let bookId: string;
  const patronId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-05-10T10:00:00.000Z"));
    collection = new LibraryCollection();
    loanRegister = new LoanRegister();
    registerLoan = new RegisterLoanUseCase(collection, loanRegister);
    bookId = await addCopyToCatalog(collection, { isbn: "978-4444444444" });
  });

  describe("When I register a loan for that copy and patron", () => {
    let outcome: Awaited<ReturnType<RegisterLoanUseCase["execute"]>>;

    beforeEach(async () => {
      outcome = await registerLoan.execute(
        new RegisterLoanCommand({ bookId, memberId: patronId }),
      );
    });

    it("Then the loan is recorded with the right copy and patron and expected dates", () => {
      expect(outcome.isOk()).toBe(true);
      if (outcome.isOk()) {
        expect(outcome.value.bookId).toBe(bookId);
        expect(outcome.value.memberId).toBe(patronId);
        expect(outcome.value.loanDate).toBe("2025-05-10T10:00:00.000Z");
        expect(outcome.value.returnedAt).toBeNull();
        const due = new Date("2025-05-10T10:00:00.000Z");
        due.setUTCDate(due.getUTCDate() + 21);
        expect(outcome.value.dueDate).toBe(due.toISOString());
      }
    });
  });
});

describe("Given the catalog does not contain the copy id I want to lend", () => {
  let collection: LibraryCollection;
  let loanRegister: LoanRegister;
  let registerLoan: RegisterLoanUseCase;

  beforeEach(() => {
    collection = new LibraryCollection();
    loanRegister = new LoanRegister();
    registerLoan = new RegisterLoanUseCase(collection, loanRegister);
  });

  describe("When I try to register a loan for that id", () => {
    const missingBookId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
    let outcome: Awaited<ReturnType<RegisterLoanUseCase["execute"]>>;

    beforeEach(async () => {
      outcome = await registerLoan.execute(
        new RegisterLoanCommand({
          bookId: missingBookId,
          memberId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        }),
      );
    });

    it("Then the use case reports that the book was not found", () => {
      expect(outcome.isErr()).toBe(true);
      if (outcome.isErr()) {
        expect(outcome.error.name).toBe("BOOK_NOT_FOUND");
      }
    });
  });
});

describe("Given a copy is marked lost in the catalog", () => {
  let collection: LibraryCollection;
  let loanRegister: LoanRegister;
  let declareBookLost: DeclareBookLostUseCase;
  let registerLoan: RegisterLoanUseCase;
  let bookId: string;

  beforeEach(async () => {
    collection = new LibraryCollection();
    loanRegister = new LoanRegister();
    declareBookLost = new DeclareBookLostUseCase(collection);
    registerLoan = new RegisterLoanUseCase(collection, loanRegister);
    bookId = await addCopyToCatalog(collection, { isbn: "978-5555555555" });
    await declareBookLost.execute(new DeclareBookLostCommand({ bookId }));
  });

  describe("When I try to register a loan on that copy", () => {
    let outcome: Awaited<ReturnType<RegisterLoanUseCase["execute"]>>;

    beforeEach(async () => {
      outcome = await registerLoan.execute(
        new RegisterLoanCommand({
          bookId,
          memberId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        }),
      );
    });

    it("Then the use case refuses because a lost copy cannot go out on loan", () => {
      expect(outcome.isErr()).toBe(true);
      if (outcome.isErr()) {
        expect(outcome.error.name).toBe("BOOK_LOST_CANNOT_BE_LOANED");
      }
    });
  });
});

describe("Given a copy already has an open loan in the register", () => {
  let collection: LibraryCollection;
  let loanRegister: LoanRegister;
  let registerLoan: RegisterLoanUseCase;
  let bookId: string;
  const patronId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-07-01T12:00:00.000Z"));
    collection = new LibraryCollection();
    loanRegister = new LoanRegister();
    registerLoan = new RegisterLoanUseCase(collection, loanRegister);
    bookId = await addCopyToCatalog(collection, { isbn: "978-6666666666" });
    const first = await registerLoan.execute(
      new RegisterLoanCommand({ bookId, memberId: patronId }),
    );
    expect(first.isOk()).toBe(true);
    vi.useRealTimers();
  });

  describe("When I try to register a second loan on the same copy", () => {
    let outcome: Awaited<ReturnType<RegisterLoanUseCase["execute"]>>;

    beforeEach(async () => {
      outcome = await registerLoan.execute(
        new RegisterLoanCommand({
          bookId,
          memberId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        }),
      );
    });

    it("Then the use case refuses because the copy is already on loan", () => {
      expect(outcome.isErr()).toBe(true);
      if (outcome.isErr()) {
        expect(outcome.error.name).toBe("BOOK_ALREADY_ON_LOAN");
      }
    });
  });
});

describe("Given a member already has two active loans on two different copies", () => {
  let collection: LibraryCollection;
  let loanRegister: LoanRegister;
  let registerLoan: RegisterLoanUseCase;
  const patronId = "cccccccc-cccc-cccc-cccc-cccccccccccc";
  let bookIdThird: string;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-08-15T09:00:00.000Z"));
    collection = new LibraryCollection();
    loanRegister = new LoanRegister();
    registerLoan = new RegisterLoanUseCase(collection, loanRegister);
    const book1 = await addCopyToCatalog(collection, {
      isbn: "978-7777777771",
    });
    const book2 = await addCopyToCatalog(collection, {
      isbn: "978-7777777772",
    });
    bookIdThird = await addCopyToCatalog(collection, {
      isbn: "978-7777777773",
    });
    const first = await registerLoan.execute(
      new RegisterLoanCommand({ bookId: book1, memberId: patronId }),
    );
    const second = await registerLoan.execute(
      new RegisterLoanCommand({ bookId: book2, memberId: patronId }),
    );
    expect(first.isOk()).toBe(true);
    expect(second.isOk()).toBe(true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("When they borrow a third copy", () => {
    let outcome: Awaited<ReturnType<RegisterLoanUseCase["execute"]>>;

    beforeEach(async () => {
      outcome = await registerLoan.execute(
        new RegisterLoanCommand({ bookId: bookIdThird, memberId: patronId }),
      );
    });

    it("Then the loan is accepted (under the limit)", () => {
      expect(outcome.isOk()).toBe(true);
    });
  });
});

describe("Given a member already has three active loans on three different copies", () => {
  let collection: LibraryCollection;
  let loanRegister: LoanRegister;
  let registerLoan: RegisterLoanUseCase;
  const patronId = "dddddddd-dddd-dddd-dddd-dddddddddddd";
  let bookIdFourth: string;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-09-01T10:00:00.000Z"));
    collection = new LibraryCollection();
    loanRegister = new LoanRegister();
    registerLoan = new RegisterLoanUseCase(collection, loanRegister);
    const books = await Promise.all([
      addCopyToCatalog(collection, { isbn: "978-8888888881" }),
      addCopyToCatalog(collection, { isbn: "978-8888888882" }),
      addCopyToCatalog(collection, { isbn: "978-8888888883" }),
    ]);
    bookIdFourth = await addCopyToCatalog(collection, {
      isbn: "978-8888888884",
    });
    for (const bookId of books) {
      const r = await registerLoan.execute(
        new RegisterLoanCommand({ bookId, memberId: patronId }),
      );
      expect(r.isOk()).toBe(true);
    }
    const active = await loanRegister.findActiveLoansForMember(patronId);
    expect(active.isOk() && active.value.length).toBe(
      MAX_ACTIVE_LOANS_PER_MEMBER,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("When they try to borrow a fourth copy", () => {
    let outcome: Awaited<ReturnType<RegisterLoanUseCase["execute"]>>;

    beforeEach(async () => {
      outcome = await registerLoan.execute(
        new RegisterLoanCommand({ bookId: bookIdFourth, memberId: patronId }),
      );
    });

    it("Then the use case refuses with MEMBER_ACTIVE_LOAN_LIMIT_EXCEEDED", () => {
      expect(outcome.isErr()).toBe(true);
      if (outcome.isErr()) {
        expect(outcome.error.name).toBe("MEMBER_ACTIVE_LOAN_LIMIT_EXCEEDED");
      }
    });
  });
});

describe("Given a member has three active loans and returns one", () => {
  let collection: LibraryCollection;
  let loanRegister: LoanRegister;
  let registerLoan: RegisterLoanUseCase;
  let recordBookReturn: RecordBookReturnUseCase;
  const patronId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
  let bookIdFourth: string;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-10-01T11:00:00.000Z"));
    collection = new LibraryCollection();
    loanRegister = new LoanRegister();
    registerLoan = new RegisterLoanUseCase(collection, loanRegister);
    recordBookReturn = new RecordBookReturnUseCase(loanRegister);
    const books = await Promise.all([
      addCopyToCatalog(collection, { isbn: "978-9999999991" }),
      addCopyToCatalog(collection, { isbn: "978-9999999992" }),
      addCopyToCatalog(collection, { isbn: "978-9999999993" }),
    ]);
    bookIdFourth = await addCopyToCatalog(collection, {
      isbn: "978-9999999994",
    });
    for (const bookId of books) {
      const r = await registerLoan.execute(
        new RegisterLoanCommand({ bookId, memberId: patronId }),
      );
      expect(r.isOk()).toBe(true);
    }
    const active = await loanRegister.findActiveLoansForMember(patronId);
    expect(active.isOk()).toBe(true);
    if (!active.isOk()) return;
    const returned = await recordBookReturn.execute(
      new RecordBookReturnCommand({ loanId: active.value[0].id() }),
    );
    expect(returned.isOk()).toBe(true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("When they borrow another copy", () => {
    let outcome: Awaited<ReturnType<RegisterLoanUseCase["execute"]>>;

    beforeEach(async () => {
      outcome = await registerLoan.execute(
        new RegisterLoanCommand({ bookId: bookIdFourth, memberId: patronId }),
      );
    });

    it("Then the loan is accepted (returned loans do not count toward the limit)", () => {
      expect(outcome.isOk()).toBe(true);
    });
  });
});
