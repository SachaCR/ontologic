import {
  Command,
  DomainEntity,
  DomainEvent,
  Repository,
  Result,
  UseCase,
  ok,
} from "ontologic";

/**
 * A use case that builds its own event, kept as a fixture.
 *
 * Nothing in this repository does this — every real use case takes the event
 * the entity handed back. But the public documentation devotes a section to it
 * (`website/docs/domain-model/domain-events.md`, "Events you can't assign to a
 * single entity"), on the grounds that some events need context only the use
 * case has. So the extractor has to resolve a `new SomeEvent(...)` reaching
 * `saveWithEvents`, and without this fixture that path has no coverage.
 *
 * This file is never compiled against the workspace `ontologic`; it is only
 * parsed.
 */
interface AccountState {
  ownerId: string;
  balance: number;
}

export class ReferralAccountOpened extends DomainEvent<
  "REFERRAL_ACCOUNT_OPENED",
  1,
  { newAccountId: string; referrerId: string }
> {
  constructor(
    entityId: string,
    payload: { newAccountId: string; referrerId: string },
  ) {
    super({ name: "REFERRAL_ACCOUNT_OPENED", version: 1, entityId, payload });
  }
}

export class Account extends DomainEntity<AccountState> {
  static fromState(id: string, state: AccountState): Account {
    return new Account(id, state);
  }
}

export interface AccountRepository extends Repository<
  Account,
  ReferralAccountOpened
> {}

export class OpenAccountViaReferralCommand extends Command<
  "OPEN_ACCOUNT_VIA_REFERRAL",
  { ownerId: string; referrerId: string }
> {
  constructor(payload: { ownerId: string; referrerId: string }) {
    super({ name: "OPEN_ACCOUNT_VIA_REFERRAL", payload });
  }
}

export class OpenAccountViaReferralUseCase implements UseCase<
  OpenAccountViaReferralCommand,
  AccountState,
  never
> {
  constructor(private readonly accounts: AccountRepository) {}

  async execute(
    command: OpenAccountViaReferralCommand,
  ): Promise<Result<AccountState, never>> {
    const { ownerId, referrerId } = command.payload;

    const account = Account.fromState("account-1", { ownerId, balance: 0 });

    // The event is built here, not by the entity — the referral is context the
    // aggregate does not have.
    const referralEvent = new ReferralAccountOpened(account.id(), {
      newAccountId: account.id(),
      referrerId,
    });

    const saved = await this.accounts.saveWithEvents(account, [referralEvent]);

    if (saved.isErr()) {
      throw saved.error;
    }

    return ok(account.readState() as AccountState);
  }
}
