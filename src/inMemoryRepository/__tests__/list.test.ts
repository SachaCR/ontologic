import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryRepository } from '../../inMemoryRepository';
import { UserState, User, makeUser } from './helpers';

describe('InMemoryRepository.list', () => {
  let repo: InMemoryRepository<UserState, User>;

  beforeEach(async () => {
    repo = new InMemoryRepository<UserState, User>(User.fromState);
    await repo.save(makeUser('1', 'A'));
    await repo.save(makeUser('2', 'B'));
    await repo.save(makeUser('3', 'C'));
  });

  it('returns ok', async () => {
    const result = await repo.list({ limit: 10, offset: 0 });
    expect(result.isOk()).toBe(true);
  });

  it('returns all entities when limit exceeds count', async () => {
    const result = await repo.list({ limit: 10, offset: 0 });
    expect(result._unsafeUnwrap().data).toHaveLength(3);
  });

  it('respects limit', async () => {
    const result = await repo.list({ limit: 2, offset: 0 });
    const unwrapped = result._unsafeUnwrap();
    expect(unwrapped.data).toHaveLength(2);
    expect(unwrapped.limit).toBe(2);
  });

  it('respects offset', async () => {
    const result = await repo.list({ limit: 10, offset: 2 });
    expect(result._unsafeUnwrap().data).toHaveLength(1);
  });

  it('returns empty data when offset exceeds count', async () => {
    const result = await repo.list({ limit: 10, offset: 99 });
    expect(result._unsafeUnwrap().data).toHaveLength(0);
  });

  it('echoes limit and offset in the response', async () => {
    const result = await repo.list({ limit: 2, offset: 1 });
    const unwrapped = result._unsafeUnwrap();
    expect(unwrapped.limit).toBe(2);
    expect(unwrapped.offset).toBe(1);
  });

  it('returns empty data when repository is empty', async () => {
    const emptyRepo = new InMemoryRepository<UserState, User>(User.fromState);
    const result = await emptyRepo.list({ limit: 10, offset: 0 });
    expect(result._unsafeUnwrap().data).toHaveLength(0);
  });
});
