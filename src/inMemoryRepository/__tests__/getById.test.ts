import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryRepository } from '../inMemoryRepository';
import { User, makeUser } from './helpers';

describe('InMemoryRepository.getById', () => {
  let repo: InMemoryRepository<User>;

  beforeEach(() => {
    repo = new InMemoryRepository<User>();
  });

  it('returns err when entity does not exist', async () => {
    const result = await repo.getById('missing');
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().message).toBe('Entity Not Found');
  });

  it('returns ok with the entity when it exists', async () => {
    const user = makeUser('42', 'Charlie');
    await repo.save(user);

    const result = await repo.getById('42');
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().state()).toEqual({ id: '42', name: 'Charlie' });
  });
});
