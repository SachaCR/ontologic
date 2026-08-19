import { Result, UseCase, err, ok } from "ontologic";

import {
  BookAlreadyOnLoanError,
  BookLostCannotBeLoanedError,
  BookNotFoundError,
} from "../entities/book/errors/book.errors";
import { Loan, LoanState } from "../entities/loan";
import {
  MAX_ACTIVE_LOANS_PER_MEMBER,
  MemberActiveLoanLimitExceededError,
} from "../entities/loan/errors/loan.errors";
import { LibraryCollection } from "../repositories/libraryCollection.repository";
import { LoanRegister } from "../repositories/loanRegister.repository";
import { RegisterLoanCommand } from "./commands/registerLoan.command";

export type RegisterLoanError =
  | BookNotFoundError
  | BookLostCannotBeLoanedError
  | BookAlreadyOnLoanError
  | MemberActiveLoanLimitExceededError;

/**
 * Lends a copy to a member. Refused if the copy is already out, or if the
 * member is at their borrowing limit.
 */
export class RegisterLoanUseCase implements UseCase<
  RegisterLoanCommand,
  LoanState,
  RegisterLoanError
> {
  constructor(
    private readonly libraryCollection: LibraryCollection,
    private readonly loanRegister: LoanRegister,
  ) {}

  async execute(
    command: RegisterLoanCommand,
  ): Promise<Result<LoanState, RegisterLoanError>> {
    const { bookId, memberId } = command.payload;

    const bookLookup = await this.libraryCollection.getById(bookId);

    if (bookLookup.isErr()) {
      throw bookLookup.error;
    }

    const book = bookLookup.value;

    if (book === undefined) {
      return err(new BookNotFoundError(bookId));
    }

    if (book.readState().lost) {
      return err(new BookLostCannotBeLoanedError(bookId));
    }

    const outstandingLookup =
      await this.loanRegister.findOutstandingLoanForBook(bookId);

    if (outstandingLookup.isErr()) {
      throw outstandingLookup.error;
    }

    if (outstandingLookup.value !== undefined) {
      return err(new BookAlreadyOnLoanError(bookId));
    }

    const activeForMember =
      await this.loanRegister.findActiveLoansForMember(memberId);

    if (activeForMember.isErr()) {
      throw activeForMember.error;
    }

    if (activeForMember.value.length >= MAX_ACTIVE_LOANS_PER_MEMBER) {
      return err(new MemberActiveLoanLimitExceededError(memberId));
    }

    const { loan, event } = Loan.create({ bookId, memberId });

    const persistence = await this.loanRegister.saveWithEvents(loan, event);

    if (persistence.isErr()) {
      throw persistence.error;
    }

    return ok(loan.readState());
  }
}
