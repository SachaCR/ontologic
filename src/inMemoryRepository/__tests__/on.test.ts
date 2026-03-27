import { describe, it, expect, beforeEach, vi } from "vitest";

import { InMemoryRepository } from "../../inMemoryRepository";
import { User, makeUser, makeEvent } from "./helpers";

describe("InMemoryRepository.on", () => {
  let repo: InMemoryRepository<User>;

  beforeEach(() => {
    repo = new InMemoryRepository<User>(User.fromState);
  });

  it("calls the handler with the entity id when saveWithEvents is called", async () => {
    const handler = vi.fn();
    repo.on(handler);

    await repo.saveWithEvents(makeUser("1"), [makeEvent("1")]);

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith("1");
  });

  it("calls the handler once per saveWithEvents call", async () => {
    const handler = vi.fn();
    repo.on(handler);

    await repo.saveWithEvents(makeUser("1"), [makeEvent("1")]);
    await repo.saveWithEvents(makeUser("1"), [makeEvent("1")]);

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("does not call the handler when save is called", async () => {
    const handler = vi.fn();
    repo.on(handler);

    await repo.save(makeUser("1"));

    expect(handler).not.toHaveBeenCalled();
  });

  it("supports multiple handlers", async () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    repo.on(handler1);
    repo.on(handler2);

    await repo.saveWithEvents(makeUser("1"), [makeEvent("1")]);

    expect(handler1).toHaveBeenCalledWith("1");
    expect(handler2).toHaveBeenCalledWith("1");
  });
});
