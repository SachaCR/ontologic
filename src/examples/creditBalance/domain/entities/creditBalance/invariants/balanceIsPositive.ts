import { BaseDomainInvariant } from "../../../../../..";
import { CreditBalanceState } from "../creditBalance.entity";

export const balanceIsPositiveInvariant =
  new BaseDomainInvariant<CreditBalanceState>(
    "Balance Is Positive",
    (state) => {
      return state.subCreditBalance >= 0;
    },
  );
