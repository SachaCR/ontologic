import { Query } from "../../../../..";

export class ReadBalanceQuery extends Query<"READ_BALANCE", { id: string }> {
  constructor(payload: { id: string }) {
    super({ name: "READ_BALANCE", payload });
  }
}
