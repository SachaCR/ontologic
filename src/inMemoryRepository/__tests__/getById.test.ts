import { describe, it, expect, beforeEach } from "vitest";

import { InMemoryRepository } from "../../inMemoryRepository";
import { User, makeUser } from "./helpers";
import { DomainEventInterface } from "../../domainEvent";

describe("InMemoryRepository.getById", () => {
  let repo: InMemoryRepository<User, DomainEventInterface>;

  beforeEach(() => {
    repo = new InMemoryRepository<User, DomainEventInterface>(User.fromState);
  });

  it("returns ok with undefined when entity does not exist", async () => {
    const result = await repo.getById("missing");
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBe(undefined);
  });

  it("returns ok with the entity when it exists", async () => {
    const user = makeUser("42", "Charlie");
    await repo.save(user);

    const result = await repo.getById("42");
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()?.readState()).toEqual({
      id: "42",
      name: "Charlie",
    });
  });
});
