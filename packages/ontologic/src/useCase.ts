import { ActionInterface } from "./action";
import { DomainError } from "./domainError";
import { Result } from "./result";

/**
 * One thing the application can be asked to do.
 *
 * A use case takes an action — a `Command` or a `Query` — and returns either the
 * state it produced or a domain failure. Technical failures are thrown; domain
 * failures come back in the `Result`.
 *
 * ```ts
 * export class PayOrderUseCase
 *   implements UseCase<PayOrderCommand, OrderState, InvalidStatusTransition | EntityNotFound>
 * {
 *   constructor(private readonly orders: OrderRepository) {}
 *
 *   async execute(command: PayOrderCommand) {
 *     const { id, invoiceId } = command.payload;
 *     // ...
 *   }
 * }
 * ```
 *
 * Dependencies are constructor parameters, which is what lets a use case span
 * more than one aggregate: it reads from as many as it needs and writes to
 * exactly one.
 *
 * `Errors` is constrained to `DomainError` on purpose. Widening it to `Error`
 * does not compile, because `DomainError` declares a required `context`
 * property that `Error` does not have. That is deliberate — an erased error
 * union throws away the exhaustiveness checking that makes `switchGuard`
 * useful, and callers cannot handle failures they cannot see. A use case with no
 * domain failure declares `never`.
 */
export interface UseCase<
  Action extends ActionInterface,
  Output,
  Errors extends DomainError<string, unknown>,
> {
  execute(action: Action): Promise<Result<Output, Errors>>;
}
