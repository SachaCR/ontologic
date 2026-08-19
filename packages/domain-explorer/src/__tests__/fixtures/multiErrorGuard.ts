import {
  Command,
  DomainEntity,
  DomainError,
  DomainEvent,
  Repository,
  Result,
  UseCase,
  err,
  ok,
} from "ontologic";

/**
 * A use case that propagates a multi-error entity method, kept as a fixture.
 *
 * Every guard in the shipped corpora yields exactly one error, so nothing there
 * exercises a single position producing several. It happens whenever a use case
 * bare-propagates a method whose error union has more than one member —
 * `err(outcome.error)` with no `switch` to narrow it — and the board has to draw
 * both errors branching off the same step.
 *
 * This file is never compiled against the workspace `ontologic`; it is only
 * parsed.
 */
interface BasketState {
  itemCount: number;
  locked: boolean;
}

export class BasketEmptied extends DomainEvent<
  "BASKET_EMPTIED",
  1,
  { basketId: string }
> {
  constructor(entityId: string, payload: { basketId: string }) {
    super({ name: "BASKET_EMPTIED", version: 1, entityId, payload });
  }
}

export class BasketLocked extends DomainError<
  "BASKET_LOCKED",
  { basketId: string }
> {
  constructor(basketId: string) {
    super({
      name: "BASKET_LOCKED",
      message: "This basket is locked",
      context: { basketId },
    });

    Object.setPrototypeOf(this, BasketLocked.prototype);
  }
}

export class BasketAlreadyEmpty extends DomainError<
  "BASKET_ALREADY_EMPTY",
  { basketId: string }
> {
  constructor(basketId: string) {
    super({
      name: "BASKET_ALREADY_EMPTY",
      message: "This basket is already empty",
      context: { basketId },
    });

    Object.setPrototypeOf(this, BasketAlreadyEmpty.prototype);
  }
}

export class BasketNotFound extends DomainError<
  "BASKET_NOT_FOUND",
  { basketId: string }
> {
  constructor(basketId: string) {
    super({
      name: "BASKET_NOT_FOUND",
      message: "No basket with this identifier",
      context: { basketId },
    });

    Object.setPrototypeOf(this, BasketNotFound.prototype);
  }
}

export class Basket extends DomainEntity<BasketState> {
  static fromState(id: string, state: BasketState): Basket {
    return new Basket(id, state);
  }

  /** Two failure modes, and the use case narrows neither. */
  empty(): Result<BasketEmptied, BasketLocked | BasketAlreadyEmpty> {
    if (this.state.locked) return err(new BasketLocked(this.id()));
    if (this.state.itemCount === 0)
      return err(new BasketAlreadyEmpty(this.id()));

    return ok(new BasketEmptied(this.id(), { basketId: this.id() }));
  }
}

export interface BasketRepository extends Repository<Basket, BasketEmptied> {}

export class EmptyBasketCommand extends Command<
  "EMPTY_BASKET",
  { basketId: string }
> {
  constructor(payload: { basketId: string }) {
    super({ name: "EMPTY_BASKET", payload });
  }
}

export class EmptyBasketUseCase implements UseCase<
  EmptyBasketCommand,
  BasketState,
  BasketNotFound | BasketLocked | BasketAlreadyEmpty
> {
  constructor(private readonly baskets: BasketRepository) {}

  async execute(
    command: EmptyBasketCommand,
  ): Promise<
    Result<BasketState, BasketNotFound | BasketLocked | BasketAlreadyEmpty>
  > {
    const { basketId } = command.payload;

    const lookup = await this.baskets.getById(basketId);

    if (lookup.isErr()) {
      throw lookup.error;
    }

    const basket = lookup.value;

    if (basket === undefined) {
      return err(new BasketNotFound(basketId));
    }

    const outcome = basket.empty();

    // Both of `empty`'s errors leave from this one position.
    if (outcome.isErr()) {
      return err(outcome.error);
    }

    const saved = await this.baskets.saveWithEvents(basket, outcome.value);

    if (saved.isErr()) {
      throw saved.error;
    }

    return ok(basket.readState() as BasketState);
  }
}
