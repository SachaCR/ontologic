import { InMemoryRepository, Result, ok } from "ontologic";

import { Loan, LoanEvent } from "../entities/loan";

/**
 * Every loan the library has made, open or closed. Its finders answer questions
 * about loans as a set, which no single loan can answer about itself.
 */
export class LoanRegister extends InMemoryRepository<Loan, LoanEvent> {
  constructor() {
    super(Loan.fromState);
  }

  /** The open loan holding this copy, if it is out. Used to refuse lending it twice. */
  async findOutstandingLoanForBook(
    bookId: string,
  ): Promise<Result<Loan | undefined, Error>> {
    for (const [id, state] of this.store) {
      if (state.bookId === bookId && state.returnedAt === null) {
        return ok(Loan.fromState(id, state));
      }
    }

    return ok(undefined);
  }

  /** Everything this member currently has out. Used to enforce the borrowing limit. */
  async findActiveLoansForMember(
    memberId: string,
  ): Promise<Result<Loan[], Error>> {
    const loans: Loan[] = [];

    for (const [id, state] of this.store) {
      if (state.memberId === memberId && state.returnedAt === null) {
        loans.push(Loan.fromState(id, state));
      }
    }

    return ok(loans);
  }
}
