import { Result, UseCase, ok } from "ontologic";

import { LoanState } from "../entities/loan";
import { LoanRegister } from "../repositories/loanRegister.repository";
import { ListOutstandingLoansForMemberQuery } from "./queries/listOutstandingLoansForMember.query";

export class ListOutstandingLoansForMemberUseCase implements UseCase<
  ListOutstandingLoansForMemberQuery,
  Array<{ id: string } & LoanState>,
  never
> {
  constructor(private readonly loanRegister: LoanRegister) {}

  async execute(
    query: ListOutstandingLoansForMemberQuery,
  ): Promise<Result<Array<{ id: string } & LoanState>, never>> {
    const { memberId } = query.payload;

    const active = await this.loanRegister.findActiveLoansForMember(memberId);

    if (active.isErr()) {
      throw active.error;
    }

    return ok(
      active.value.map((loan) => ({
        id: loan.id(),
        ...loan.readState(),
      })),
    );
  }
}
