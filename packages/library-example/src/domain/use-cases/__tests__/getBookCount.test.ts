import { beforeEach, describe, expect, it } from "vitest";

import { GetBookCountUseCase } from "../getBookCount.use-case";
import { GetBookCountQuery } from "../queries/getBookCount.query";
import { StatsRegister } from "../../repositories/statsRegister.repository";
import { LIBRARY_STATS_ID, LibraryStats } from "../../entities/libraryStats";

describe("Given the library has already counted three copies", () => {
  let statsRegister: StatsRegister;
  let getBookCount: GetBookCountUseCase;

  beforeEach(async () => {
    statsRegister = new StatsRegister();
    getBookCount = new GetBookCountUseCase(statsRegister);

    // Built directly rather than through a mutator: how the tally moves is
    // the projection's business, and this test only needs a tally that reads 3.
    const stats = LibraryStats.fromState(LIBRARY_STATS_ID, { bookCount: 3 });

    await statsRegister.saveWithEvents(stats, []);
  });

  describe("When I ask how many copies the library has taken in", () => {
    let outcome: Awaited<ReturnType<GetBookCountUseCase["execute"]>>;

    beforeEach(async () => {
      outcome = await getBookCount.execute(new GetBookCountQuery());
    });

    it("Then I am told three", () => {
      expect(outcome.isOk()).toBe(true);
      if (outcome.isOk()) {
        expect(outcome.value.bookCount).toBe(3);
      }
    });
  });
});

describe("Given the library has counted nothing yet", () => {
  let getBookCount: GetBookCountUseCase;

  beforeEach(() => {
    getBookCount = new GetBookCountUseCase(new StatsRegister());
  });

  describe("When I ask how many copies the library has taken in", () => {
    let outcome: Awaited<ReturnType<GetBookCountUseCase["execute"]>>;

    beforeEach(async () => {
      outcome = await getBookCount.execute(new GetBookCountQuery());
    });

    it("Then I am told none, rather than being refused", () => {
      expect(outcome.isOk()).toBe(true);
      if (outcome.isOk()) {
        expect(outcome.value.bookCount).toBe(0);
      }
    });
  });
});
