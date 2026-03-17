import { CreditBalanceCreated } from "./creditBalanceCreated.event";
import { CreditBalanceCredited } from "./creditBalanceCredited.event";
import { CreditBalanceDebited } from "./creditBalanceDebited.event";

export type CreditBalanceEvent =
  | CreditBalanceCreated
  | CreditBalanceCredited
  | CreditBalanceDebited;
