import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryRepository } from '../inMemoryRepository';
import { UserState, User, makeUser, makeEvent } from './helpers';

describe('InMemoryRepository.saveWithEvents', () => {
  let repo: InMemoryRepository<UserState, User>;

  beforeEach(() => {
    repo = new InMemoryRepository<UserState, User>(User.fromState);
  });

  it('returns ok', async () => {
    const result = await repo.saveWithEvents(makeUser('1'), [makeEvent('1')]);
    expect(result.isOk()).toBe(true);
  });

  it('persists the entity', async () => {
    const user = makeUser('1');
    await repo.saveWithEvents(user, [makeEvent('1')]);

    const result = await repo.getById('1');
    expect(result._unsafeUnwrap().readState()).toEqual(user.readState());
  });

  it('stores the provided events', async () => {
    const event = makeEvent('1', 'UserCreated');
    await repo.saveWithEvents(makeUser('1'), [event]);

    const events = (await repo.getEvents('1'))._unsafeUnwrap();
    expect(events).toEqual([event]);
  });

  it('accumulates events across multiple calls for the same entity', async () => {
    const user = makeUser('1');
    const event1 = makeEvent('1', 'Created');
    const event2 = makeEvent('1', 'Updated');

    await repo.saveWithEvents(user, [event1]);
    await repo.saveWithEvents(user, [event2]);

    const events = (await repo.getEvents('1'))._unsafeUnwrap();
    expect(events).toEqual([event1, event2]);
  });

  it('does not mix events between different entities', async () => {
    await repo.saveWithEvents(makeUser('1'), [makeEvent('1', 'Created')]);
    await repo.saveWithEvents(makeUser('2'), [makeEvent('2', 'Created')]);

    const events1 = (await repo.getEvents('1'))._unsafeUnwrap();
    const events2 = (await repo.getEvents('2'))._unsafeUnwrap();
    expect(events1).toHaveLength(1);
    expect(events2).toHaveLength(1);
    expect(events1[0].entityId).toBe('1');
    expect(events2[0].entityId).toBe('2');
  });
});
