# command-bus-examples

Runnable examples of the Ontologic command bus, and the home of the Redis and
SQS connectors.

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
| `src/connectors/` | Where Redis and SQS go — see its README |
| `src/connectors/__tests__/contract.ts` | The contract every connector set must satisfy |

`startPlaceOrderBus` takes any `CommandBusConnectors`, so the example code does
not change when the transport does. That is the point of the split.

## Adding a connector

Implement the four interfaces, then run the shared contract against it:

```ts
testCommandBusConnectors("redis", { create: () => new RedisCommandBusConnectors(...) });
```

`src/connectors/README.md` has the interfaces, the reasoning behind the
dynamic response topic, and what ordering guarantees the bus expects.
