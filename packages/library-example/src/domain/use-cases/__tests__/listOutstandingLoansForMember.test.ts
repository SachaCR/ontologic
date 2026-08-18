import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ListOutstandingLoansForMemberUseCase } from "../listOutstandingLoansForMember.use-case";
import { ListOutstandingLoansForMemberQuery } from "../queries/listOutstandingLoansForMember.query";
import { RegisterLoanUseCase } from "../registerLoan.use-case";
import { RegisterLoanCommand } from "../commands/registerLoan.command";
import { RecordBookReturnUseCase } from "../recordBookReturn.use-case";
import { RecordBookReturnCommand } from "../commands/recordBookReturn.command";
import { LibraryCollection } from "../../repositories/libraryCollection.repository";
import { LoanRegister } from "../../repositories/loanRegister.repository";
import { addCopyToCatalog } from "./helpers";

describe("listOutstandingLoansForMember", () => {
  let collection: LibraryCollection;
  let loanRegister: LoanRegister;
  let registerLoan: RegisterLoanUseCase;
  let recordBookReturn: RecordBookReturnUseCase;
  let listOutstandingLoansForMember: ListOutstandingLoansForMemberUseCase;
  const memberId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-01T12:00:00.000Z"));
    collection = new LibraryCollection();
    loanRegister = new LoanRegister();
    registerLoan = new RegisterLoanUseCase(collection, loanRegister);
    recordBookReturn = new RecordBookReturnUseCase(loanRegister);
    listOutstandingLoansForMember = new ListOutstandingLoansForMemberUseCase(
      loanRegister,
    );
  });

  it("returns an empty list when the member has no active loans", async () => {
    const outcome = await listOutstandingLoansForMember.execute(
      new ListOutstandingLoansForMemberQuery({ memberId }),
    );

    expect(outcome.isOk()).toBe(true);
    if (outcome.isOk()) {
      expect(outcome.value).toEqual([]);
    }
  });

  it("returns only active loans (excludes returned)", async () => {
    const bookId = await addCopyToCatalog(collection, {
      isbn: "978-1111111111",
    });
    const registered = await registerLoan.execute(
      new RegisterLoanCommand({ bookId, memberId }),
    );
    expect(registered.isOk()).toBe(true);

    const activeLookup = await loanRegister.findActiveLoansForMember(memberId);
    expect(activeLookup.isOk()).toBe(true);
    if (!activeLookup.isOk()) return;
    const loanId = activeLookup.value[0].id();

    const returned = await recordBookReturn.execute(
      new RecordBookReturnCommand({ loanId }),
    );
    expect(returned.isOk()).toBe(true);

    const outcome = await listOutstandingLoansForMember.execute(
      new ListOutstandingLoansForMemberQuery({ memberId }),
    );

    expect(outcome.isOk()).toBe(true);
    if (outcome.isOk()) {
      expect(outcome.value).toEqual([]);
    }
  });

  it("lists active loans with id and state", async () => {
    const bookId = await addCopyToCatalog(collection, {
      isbn: "978-2222222222",
    });
    await registerLoan.execute(new RegisterLoanCommand({ bookId, memberId }));

    const outcome = await listOutstandingLoansForMember.execute(
      new ListOutstandingLoansForMemberQuery({ memberId }),
    );

    expect(outcome.isOk()).toBe(true);
    if (outcome.isOk()) {
      expect(outcome.value).toHaveLength(1);
      expect(outcome.value[0].bookId).toBe(bookId);
      expect(outcome.value[0].memberId).toBe(memberId);
      expect(outcome.value[0].returnedAt).toBeNull();
      expect(outcome.value[0].id).toBeDefined();
    }
  });
});
