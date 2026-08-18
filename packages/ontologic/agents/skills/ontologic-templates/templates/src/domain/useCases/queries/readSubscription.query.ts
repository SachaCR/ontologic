import { Query } from "ontologic";

/**
 * A QUERY: a request to read. A use case declared over a query writes nothing,
 * and the type says so — a reader does not have to scan the body for a `save`.
 */
export class ReadSubscriptionQuery extends Query<
  "READ_SUBSCRIPTION",
  { id: string }
> {
  constructor(payload: { id: string }) {
    super({ name: "READ_SUBSCRIPTION", payload });
  }
}
