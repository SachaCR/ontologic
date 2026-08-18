import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listOutstandingLoansForMember } from "../listOutstandingLoansForMember.use-case";
import { registerLoan } from "../registerLoan.use-case";
import { recordBookReturn } from "../recordBookReturn.use-case";
import { LibraryCollection } from "../../repositories/libraryCollection.repository";
import { LoanRegister } from "../../repositories/loanRegister.repository";
import { addCopyToCatalog } from "./helpers";

describe("listOutstandingLoansForMember", () => {
  let collection: LibraryCollection;
  let loanRegister: LoanRegister;
  const memberId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-01T12:00:00.000Z"));
    collection = new LibraryCollection();
    loanRegister = new LoanRegister();
  });

  it("returns an empty list when the member has no active loans", async () => {
    const outcome = await listOutstandingLoansForMember(
      { memberId },
      { loanRegister },
    );

    expect(outcome.isOk()).toBe(true);
    if (outcome.isOk()) {
      expect(outcome.value).toEqual([]);
    }
  });

  it("returns only active loans (excludes returned)", async () => {
    const bookId = await addCopyToCatalog(collection, { isbn: "978-1111111111" });
    const registered = await registerLoan(
      { bookId, memberId },
      { libraryCollection: collection, loanRegister },
    );
    expect(registered.isOk()).toBe(true);

    const activeLookup = await loanRegister.findActiveLoansForMember(memberId);
    expect(activeLookup.isOk()).toBe(true);
    if (!activeLookup.isOk()) return;
    const loanId = activeLookup.value[0].id();

    const returned = await recordBookReturn({ loanId }, { loanRegister });
    expect(returned.isOk()).toBe(true);

    const outcome = await listOutstandingLoansForMember(
      { memberId },
      { loanRegister },
    );

    expect(outcome.isOk()).toBe(true);
    if (outcome.isOk()) {
      expect(outcome.value).toEqual([]);
    }
  });

  it("lists active loans with id and state", async () => {
    const bookId = await addCopyToCatalog(collection, { isbn: "978-2222222222" });
    await registerLoan(
      { bookId, memberId },
      { libraryCollection: collection, loanRegister },
    );

    const outcome = await listOutstandingLoansForMember(
      { memberId },
      { loanRegister },
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
