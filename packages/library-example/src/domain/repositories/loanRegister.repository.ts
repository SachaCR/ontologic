import { InMemoryRepository, Result, ok } from "ontologic";

import { Loan, LoanEvent } from "../entities/loan";

export class LoanRegister extends InMemoryRepository<Loan, LoanEvent> {
  constructor() {
    super(Loan.fromState);
  }

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
