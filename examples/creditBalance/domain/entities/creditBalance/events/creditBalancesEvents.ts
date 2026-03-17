import { CreditBalanceCreated } from "./creditBalanceCreated";
import { CreditBalanceCredited } from "./creditBalanceCredited";
import { CreditBalanceDebited } from "./creditBalanceDebited";

export type CreditBalanceEvent =
  | CreditBalanceCreated
  | CreditBalanceCredited
  | CreditBalanceDebited;
