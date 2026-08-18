import { Result, err, ok } from "ontologic";

import { LoanState } from "../entities/loan";
import { LoanRegister } from "../repositories/loanRegister.repository";

export async function listOutstandingLoansForMember(
  query: { memberId: string },
  dependencies: { loanRegister: LoanRegister },
): Promise<Result<Array<{ id: string } & LoanState>, Error>> {
  const { memberId } = query;
  const { loanRegister } = dependencies;

  const active = await loanRegister.findActiveLoansForMember(memberId);

  if (active.isErr()) {
    return err(active.error);
  }

  return ok(
    active.value.map((loan) => ({
      id: loan.id(),
      ...loan.readState(),
    })),
  );
}
