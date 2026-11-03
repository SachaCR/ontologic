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

The example is a CLI over Redis or SQS. Each process runs **several instances** (3 by default):

- **Emitters** sit behind one interactive prompt. Type a command, or `simulate` to send random orders
  from all of them; each answer prints when it comes back, in its emitter's color.
- **Receivers** log every command they receive and every answer they send, each in its own color.
  They wait a random 500 ms to 3 s before answering, to look like real work.

Describe your brokers once in `.env` (Redis, and LocalStack for SQS):

```bash
cp .env.example .env   # then set REDIS_URL, SQS_ENDPOINT... for your machine
```

The CLI loads `.env` on start; a variable set in your shell still wins over it. Then start the
receivers in one terminal and the emitters in another:

```bash
pnpm --filter command-bus-examples cli receiver   # terminal 1: 3 receivers
pnpm --filter command-bus-examples cli emitter    # terminal 2: 3 emitters, then type: simulate
```

`--transport sqs` (the default) puts commands on an SQS FIFO queue and responses on Redis: the
production shape. `--transport redis` puts both on Redis. `cli both` runs emitters and receivers in
one process.

```
> simulate 10
Simulating 10 orders from 3 emitter(s)...
[emitter-2] → sent cmd 4134c49e (order-6)
[emitter-3] → sent cmd bfc52b32 (order-6)
[emitter-3] → sent cmd 2ecd7cb5 (order-6)
[emitter-3] → sent cmd 6a186591 (order-4)
[emitter-3] ← cmd 6a186591 accepted in 834ms: {"orderId":"order-4","status":"PLACED","itemCount":8}
[emitter-2] ← cmd 4134c49e accepted in 2152ms: {"orderId":"order-6","status":"PLACED","itemCount":6}
[emitter-3] ← cmd bfc52b32 accepted in 3129ms: {"orderId":"order-6","status":"PLACED","itemCount":6}
[emitter-3] ← cmd 2ecd7cb5 accepted in 5229ms: {"orderId":"order-6","status":"PLACED","itemCount":13}
```

On the receiving side, `order-6`'s three commands are handled one after the other, whichever
receiver gets them, while other orders run in parallel:

```
[receiver-2] received PLACE_ORDER cmd 4134c49e (order-6, correlation corr-4134c49e)
[receiver-1] received PLACE_ORDER cmd 6a186591 (order-4, correlation corr-6a186591)
[receiver-1] answered cmd 6a186591 after 819ms: SUCCESS
[receiver-2] answered cmd 4134c49e after 2040ms: SUCCESS
[receiver-3] received PLACE_ORDER cmd bfc52b32 (order-6, correlation corr-bfc52b32)
[receiver-3] answered cmd bfc52b32 after 1390ms: SUCCESS
[receiver-3] received PLACE_ORDER cmd 2ecd7cb5 (order-6, correlation corr-2ecd7cb5)
[receiver-3] answered cmd 2ecd7cb5 after 2194ms: SUCCESS
```

That per-order sequencing is SQS FIFO's `MessageGroupId` at work. Over `--transport redis` it does
not hold: a stream consumer group spreads one order's commands across receivers, and you can watch
them run at the same time.

A business refusal is an answer like any other: an order with no item comes back as an `Err`
(`refused ... EMPTY_ORDER`), the same way it would from an in-process call (see
`src/domain/placeOrder.ts`).

There is no in-memory mode: in-memory listeners broadcast every message to every subscriber, so
several receivers would each handle every command. The tests still use the in-memory connectors.

### At the prompt

| Command | What it does |
|---|---|
| `simulate [count]` | Sends `count` random orders (default 10, max 100) from all the emitters, a few ms apart. Order ids repeat, and about one in seven is empty |
| `place <orderId> [sku:qty ...]` | Sends one PlaceOrder from the next emitter in turn, e.g. `place order-1 BOOK-1:2` |
| `help` | Lists the commands |
| `quit` (or Ctrl+C, Ctrl+D) | Waits for running simulations and the answers still due, then exits |

### Options

| Option | Default | |
|---|---|---|
| role: `emitter`, `receiver`, `both` | `both` | |
| `--transport redis\|sqs` | `sqs` | |
| `--instances <n>` | `3` | emitters, and receivers, per process |
| `--timeout <ms>` | `10000` | how long an emitter waits for an answer. One order's commands queue behind each other, so keep it well above the latency |
| `--latency <min-max>` | `500-3000` | a receiver waits a random time in this range before answering. Above `--timeout`, you get `COMMAND_TIMEOUT` |

| Environment (`.env`) | Default | |
|---|---|---|
| `REDIS_URL` | `redis://127.0.0.1:6379` | the Redis server itself, not a RedisInsight UI |
| `SQS_ENDPOINT` | unset (real AWS) | `http://localhost:4566` for LocalStack. When set, the queue is created on demand |
| `AWS_REGION` | `us-east-1` | |
| `COMMAND_TOPIC` | `place-order-commands` | the Redis stream, or the SQS queue (`.fifo` is added) |
| `NO_COLOR` | unset | set it to turn colors off. They are off already when the output is not a terminal |

## Layout

| Path | What |
|---|---|
| `src/domain/placeOrder.ts` | The example command, its validator and its handler |
| `src/commandBus.ts` | Transport-agnostic wiring: `startReceiver`, `startEmitter`, or both with `startPlaceOrderBus` |
| `src/connectors/` | The Redis and SQS connector sets, one per instance, through `createConnectors(transport, config, instance)` |
| `src/cli/` | The CLI: options, the prompt, and what each side prints |
| `src/connectors/__tests__/` | The contract, and a harness per broker |
| `src/connectors/__tests__/contract.ts` | The contract every connector set must satisfy |

The wiring takes any `CommandBusConnectors`, so the example code does not change
when the transport does. That is the point of the split.

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
anyone without the services running. `pnpm test` leaves `.env` alone, so both
suites skip and the rest runs. `pnpm test:brokers` loads `.env` first and runs
them against the brokers it names:

```bash
pnpm --filter command-bus-examples test:brokers
```

The Redis suite needs `REDIS_URL`; the SQS suite needs `SQS_ENDPOINT` and
`REDIS_URL`.

The SQS suite needs both services: commands go through a FIFO queue, responses
through Redis pub/sub. `src/connectors/README.md` explains why that split is the
design rather than a limitation.
