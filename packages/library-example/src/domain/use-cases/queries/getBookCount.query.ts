import { Query } from "ontologic";

export class GetBookCountQuery extends Query<"GET_BOOK_COUNT", object> {
  constructor() {
    super({ name: "GET_BOOK_COUNT", payload: {} });
  }
}
