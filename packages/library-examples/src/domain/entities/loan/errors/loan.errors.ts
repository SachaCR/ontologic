import { DomainError } from "ontologic";

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
  }
}

export const MAX_ACTIVE_LOANS_PER_MEMBER = 3;
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
  }
}

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
  }
}
