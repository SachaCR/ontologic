import { err, ok, Result } from "ontologic";
import { LoanState } from "../entities/loan";
import { LoanNotFoundError } from "../entities/loan/errors/loan.errors";
import { LoanRegister } from "../repositories/loanRegister.repository";

export async function recordBookReturn(
  returnReceipt: { loanId: string },
  dependencies: { loanRegister: LoanRegister },
): Promise<Result<LoanState, Error>> {
  const { loanId } = returnReceipt;
  const { loanRegister } = dependencies;

  const returnedAt = new Date().toISOString();

  const loanLookup = await loanRegister.getById(loanId);

  if (loanLookup.isErr()) {
    return err(loanLookup.error);
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

  const persistence = await loanRegister.saveWithEvents(
    loan,
    loanReturnedEvent,
  );

  if (persistence.isErr()) {
    return err(persistence.error);
  }

  return ok(loan.readState());
}
