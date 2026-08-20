import { InMemoryRepository } from "ontologic";

import { LibraryStats } from "../entities/libraryStats";

/**
 * Where the counted totals are kept.
 *
 * The event union is `never` on purpose: this is the read side, so nothing here
 * records a fact. It stores what the projection worked out, and the query use
 * case reads it back the same way any other use case reads an aggregate.
 */
export class StatsRegister extends InMemoryRepository<LibraryStats, never> {
  constructor() {
    super(LibraryStats.fromState);
  }
}
