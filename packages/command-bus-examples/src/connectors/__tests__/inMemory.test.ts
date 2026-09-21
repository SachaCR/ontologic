import { InMemoryCommandBusConnectors } from "ontologic";

import { testCommandBusConnectors } from "./contract";

// The reference run. Redis and SQS get the same three lines once they land.
testCommandBusConnectors("in-memory", {
  create: () => new InMemoryCommandBusConnectors(),
});
