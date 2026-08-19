import { randomUUID } from "crypto";

import { DomainEntity, Result, err, ok } from "ontologic";

import { LoanAlreadyReturnedError } from "./errors/loan.errors";
import { LoanCreatedEvent } from "./events/loanCreated.event";
import { LoanReturnedEvent } from "./events/loanReturned.event";
import { dueDateAfterLoanDate } from "./invariants/dueDateAfterLoanDate.invariant";
import { returnDateAfterLoanDate } from "./invariants/returnDateAfterLoanDate.invariant";

export type LoanEvent = LoanCreatedEvent | LoanReturnedEvent;

export interface LoanState {
  bookId: string;
  memberId: string;
  loanDate: string;
  dueDate: string;
  returnedAt: string | null;
}

/** Lending policy: calendar days from loan start until the copy is due back. */
const STANDARD_LOAN_LENGTH_DAYS = 21;

/**
 * One member's borrowing of one copy, from the day it leaves the shelf until it
 * comes back. A loan stays open until the copy is returned, which is how the
 * library knows what is still out.
 */
export class Loan extends DomainEntity<LoanState> {
  private constructor(id: string, state: LoanState) {
    super(id, state, {
      invariants: [dueDateAfterLoanDate, returnDateAfterLoanDate],
    });
  }

  static fromState(id: string, state: LoanState) {
    return new Loan(id, state);
  }

  /**
   * Lends the copy to a member and sets the date it is due back. The term comes
   * from the library's lending policy, so every loan gets the same one.
   */
  static create(params: { bookId: string; memberId: string }): {
    loan: Loan;
    event: LoanCreatedEvent;
  } {
    const { bookId, memberId } = params;

    const loanDate = new Date();
    const { dueDate } = Loan.calculateDueDate(loanDate);

    const id = randomUUID();

    const state: LoanState = {
      bookId,
      memberId,
      loanDate: loanDate.toISOString(),
      dueDate: dueDate.toISOString(),
      returnedAt: null,
    };

    const event = new LoanCreatedEvent(id, {
      bookId,
      memberId,
      loanDate: loanDate.toISOString(),
      dueDate: dueDate.toISOString(),
    });

    return {
      event,
      loan: new Loan(id, state),
    };
  }

  /**
   * Records the copy coming back and closes the loan. The moment of return is
   * passed in rather than read from the clock here, which keeps this testable.
   */
  returnBook(
    returnedAt: string,
  ): Result<LoanReturnedEvent, LoanAlreadyReturnedError> {
    const state = this.readState();

    if (state.returnedAt !== null) {
      return err(new LoanAlreadyReturnedError(this.id()));
    }

    this.state = { ...state, returnedAt };

    const event = new LoanReturnedEvent(this.id(), {
      bookId: state.bookId,
      memberId: state.memberId,
      returnedAt,
    });

    return ok(event);
  }

  static calculateDueDate(startDate: Date): { dueDate: Date } {
    const dueDate = new Date(startDate);
    dueDate.setUTCDate(dueDate.getUTCDate() + STANDARD_LOAN_LENGTH_DAYS);
    return { dueDate };
  }
}
