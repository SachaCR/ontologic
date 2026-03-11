import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryRepository } from '../inMemoryRepository';
import { UserState, User, makeUser } from './helpers';

describe('InMemoryRepository.save', () => {
  let repo: InMemoryRepository<UserState, User>;

  beforeEach(() => {
    repo = new InMemoryRepository<UserState, User>(User.fromState);
  });

  it('returns ok', async () => {
    const result = await repo.save(makeUser('1'));
    expect(result.isOk()).toBe(true);
  });

  it('persists the entity so it can be retrieved', async () => {
    const user = makeUser('1', 'Alice');
    await repo.save(user);

    const result = await repo.getById('1');
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().readState()).toEqual(user.readState());
  });

  it('overwrites an existing entity with the same id', async () => {
    await repo.save(makeUser('1', 'Alice'));
    const updated = makeUser('1', 'Bob');
    await repo.save(updated);

    const result = await repo.getById('1');
    expect(result._unsafeUnwrap().readState().name).toBe('Bob');
  });
});
