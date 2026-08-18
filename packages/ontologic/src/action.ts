/**
 * The thing a use case is asked to do.
 *
 * An action is either a `Command` — an intent to change something, which may be
 * refused — or a `Query` — a request to read, which cannot. Both carry a literal
 * `name` in the same way a `DomainEvent` does, so the intent is a fact of the
 * type system rather than something a reader has to infer from a function name.
 *
 * The distinction is enforced structurally: `Command` and `Query` each hold
 * private fields, so neither is assignable to the other even though their shapes
 * are identical. A use case declared over a `Command` cannot be handed a `Query`.
 */
export interface ActionInterface {
  kind: "command" | "query";
  name: string;
  payload: unknown;
}

/**
 * An intent to change state.
 *
 * Mirrors `DomainEvent`: the name is a literal type parameter, the payload is
 * cloned on the way in and on the way out, and subclasses bind the literals so
 * callers never repeat them.
 *
 * ```ts
 * export class PayOrderCommand extends Command<
 *   "PAY_ORDER",
 *   { id: string; invoiceId: string }
 * > {
 *   constructor(payload: { id: string; invoiceId: string }) {
 *     super({ name: "PAY_ORDER", payload });
 *   }
 * }
 * ```
 *
 * A command carries no `entityId` — the entity it targets may not exist yet —
 * and no version, because commands are not persisted the way events are.
 */
export class Command<Name extends string, Payload> implements ActionInterface {
  #name: Name;
  #payload: Payload;

  constructor(params: { name: Name; payload: Payload }) {
    const { name, payload } = params;

    this.#name = name;
    this.#payload = structuredClone(payload);
  }

  get kind(): "command" {
    return "command";
  }

  get name(): Name {
    return this.#name;
  }

  get payload(): Payload {
    return structuredClone(this.#payload);
  }

  toJSON(): {
    kind: "command";
    name: Name;
    payload: Payload;
  } {
    return {
      kind: "command",
      name: this.#name,
      payload: this.payload,
    };
  }
}

/**
 * A request to read state.
 *
 * Identical in shape to `Command`, and deliberately not interchangeable with it.
 * A use case answering a query reads from as many aggregates as it needs and
 * writes to none.
 *
 * ```ts
 * export class ReadBalanceQuery extends Query<"READ_BALANCE", { id: string }> {
 *   constructor(payload: { id: string }) {
 *     super({ name: "READ_BALANCE", payload });
 *   }
 * }
 * ```
 */
export class Query<Name extends string, Payload> implements ActionInterface {
  #name: Name;
  #payload: Payload;

  constructor(params: { name: Name; payload: Payload }) {
    const { name, payload } = params;

    this.#name = name;
    this.#payload = structuredClone(payload);
  }

  get kind(): "query" {
    return "query";
  }

  get name(): Name {
    return this.#name;
  }

  get payload(): Payload {
    return structuredClone(this.#payload);
  }

  toJSON(): {
    kind: "query";
    name: Name;
    payload: Payload;
  } {
    return {
      kind: "query",
      name: this.#name,
      payload: this.payload,
    };
  }
}
