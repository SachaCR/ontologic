import { BaseDomainInvariant } from "ontologic";

import { LoanState } from "../loan.entity";

export const returnDateAfterLoanDate = new BaseDomainInvariant<LoanState>(
  "Return date must be after loan date",
  (state) =>
    state.returnedAt === null ||
    new Date(state.returnedAt) >= new Date(state.loanDate),
);
