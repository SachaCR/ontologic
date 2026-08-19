import { Result, UseCase, err, ok } from "ontologic";

import { LoanState } from "../entities/loan";
import {
  LoanAlreadyReturnedError,
  LoanNotFoundError,
} from "../entities/loan/errors/loan.errors";
import { LoanRegister } from "../repositories/loanRegister.repository";
import { RecordBookReturnCommand } from "./commands/recordBookReturn.command";

/**
 * Takes a copy back from a member and closes their loan. The copy itself is
 * never touched — the loan is the thing that knows it was out.
 */
export class RecordBookReturnUseCase implements UseCase<
  RecordBookReturnCommand,
  LoanState,
  LoanNotFoundError | LoanAlreadyReturnedError
> {
  constructor(private readonly loanRegister: LoanRegister) {}

  async execute(
    command: RecordBookReturnCommand,
  ): Promise<Result<LoanState, LoanNotFoundError | LoanAlreadyReturnedError>> {
    const { loanId } = command.payload;

    // The use case reads the clock; the entity just records what it is told.
    const returnedAt = new Date().toISOString();

    const loanLookup = await this.loanRegister.getById(loanId);

    if (loanLookup.isErr()) {
      throw loanLookup.error;
    }

    const loan = loanLookup.value;

    if (loan === undefined) {
      return err(new LoanNotFoundError(loanId));
    }

    const returnOutcome = loan.returnBook(returnedAt);

    if (returnOutcome.isErr()) {
      return err(returnOutcome.error);
    }

    const loanReturnedEvent = returnOutcome.value;

    const persistence = await this.loanRegister.saveWithEvents(
      loan,
      loanReturnedEvent,
    );

    if (persistence.isErr()) {
      throw persistence.error;
    }

    return ok(loan.readState());
  }
}
