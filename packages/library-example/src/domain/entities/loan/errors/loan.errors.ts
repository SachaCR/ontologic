import { DomainError } from "ontologic";

/** The copy has already come back and this loan is closed. */
export class LoanAlreadyReturnedError extends DomainError<
  "LOAN_ALREADY_RETURNED",
  { loanId: string }
> {
  constructor(loanId: string) {
    super({
      name: "LOAN_ALREADY_RETURNED",
      message: `Loan has already been returned`,
      context: { loanId },
    });

    Object.setPrototypeOf(this, LoanAlreadyReturnedError.prototype);
  }
}

export const MAX_ACTIVE_LOANS_PER_MEMBER = 3;
/** The member already has as many copies out as the library allows. The limit travels with the error. */
export class MemberActiveLoanLimitExceededError extends DomainError<
  "MEMBER_ACTIVE_LOAN_LIMIT_EXCEEDED",
  { memberId: string; limit: number }
> {
  constructor(memberId: string) {
    super({
      name: "MEMBER_ACTIVE_LOAN_LIMIT_EXCEEDED",
      message: `Member has reached the active loan limit (${MAX_ACTIVE_LOANS_PER_MEMBER} books)`,
      context: { memberId, limit: MAX_ACTIVE_LOANS_PER_MEMBER },
    });

    Object.setPrototypeOf(this, MemberActiveLoanLimitExceededError.prototype);
  }
}

/** The register has no loan with this id. */
export class LoanNotFoundError extends DomainError<
  "LOAN_NOT_FOUND",
  { loanId: string }
> {
  constructor(loanId: string) {
    super({
      name: "LOAN_NOT_FOUND",
      message: "No loan exists with this identifier in the loan register",
      context: { loanId },
    });

    Object.setPrototypeOf(this, LoanNotFoundError.prototype);
  }
}
