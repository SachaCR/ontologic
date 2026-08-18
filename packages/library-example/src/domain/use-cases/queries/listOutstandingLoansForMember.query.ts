import { Query } from "ontologic";

export class ListOutstandingLoansForMemberQuery extends Query<
  "LIST_OUTSTANDING_LOANS_FOR_MEMBER",
  { memberId: string }
> {
  constructor(payload: { memberId: string }) {
    super({ name: "LIST_OUTSTANDING_LOANS_FOR_MEMBER", payload });
  }
}
