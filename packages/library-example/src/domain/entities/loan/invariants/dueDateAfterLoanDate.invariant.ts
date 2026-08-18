import { BaseDomainInvariant } from "ontologic";

import { LoanState } from "../loan.entity";

export const dueDateAfterLoanDate = new BaseDomainInvariant<LoanState>(
  "Due date must be after loan date",
  (state) => new Date(state.dueDate) > new Date(state.loanDate),
);
