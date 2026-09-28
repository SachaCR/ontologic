# command-bus-examples

Runnable examples of the Ontologic command bus, and the lab where the connector
packages are proven against real brokers.

The connectors live in [`@ontologics/redis-connectors`](../redis-connectors) and
[`@ontologics/sqs-connectors`](../sqs-connectors); this package consumes them the
way an application would.

A command bus is request/response over a broker: a caller `send`s a command and
waits for the handler's answer, with a timeout. It is the counterpart to the
event bus, which is fire-and-forget.

## Run it

```bash
pnpm --filter command-bus-examples example:in-memory
```

```
accepted: {"orderId":"order-1","status":"PLACED","itemCount":3}
refused: EMPTY_ORDER: Order order-2 has no item
```

Both outcomes are values. A business refusal comes back as an `Err`, the same
way it would from an in-process call — see `src/domain/placeOrder.ts`.

## Layout

| Path | What |
|---|---|
| `src/domain/placeOrder.ts` | The example command and its handler |
| `src/commandBus.ts` | Transport-agnostic wiring: give it connectors, get a started bus |
| `src/example.ts` | The runnable script above, over the in-memory connectors |
| `src/connectors/__tests__/` | The contract, and a harness per broker |
| `src/connectors/__tests__/contract.ts` | The contract every connector set must satisfy |

`startPlaceOrderBus` takes any `CommandBusConnectors`, so the example code does
not change when the transport does. That is the point of the split.

## Adding a connector

Implement the four interfaces, each declaring its `kind`, then point the shared
contract at the set:

```ts
testCommandBusConnectors("redis", {
  create: () => new RedisCommandBusConnectors({ redisUrl, namespace }),
  destroy: (connectors) => connectors.disconnect(),
  timeout: 10_000,
});
```

`src/connectors/README.md` has the interfaces and their `kind` values, the
reasoning behind the dynamic response topic, what ordering actually guarantees
once a consumer group is involved, and the two things to know before running the
Redis connectors in anger.

## Broker tests

They are opt-in, because defaulting to localhost would make `pnpm test` red for
anyone without the services running. With neither variable set both suites skip
and the rest runs.

```bash
# Redis for both channels
docker run -d --rm -p 6379:6379 redis:7-alpine
REDIS_URL=redis://127.0.0.1:6379 pnpm --filter command-bus-examples test

# SQS FIFO for commands, Redis for responses — the production shape
docker run -d --rm -p 4566:4566 localstack/localstack
SQS_ENDPOINT=http://localhost:4566 REDIS_URL=redis://127.0.0.1:6379 \
  pnpm --filter command-bus-examples test
```

The SQS suite needs both services: commands go through a FIFO queue, responses
through Redis pub/sub. `src/connectors/README.md` explains why that split is the
design rather than a limitation.
