import { DomainEntity } from "ontologic";

/**
 * The library keeps one running tally, so it always has the same identity. A
 * read model needs somewhere to put what it has counted, and that somewhere has
 * to be findable without knowing an id.
 */
export const LIBRARY_STATS_ID = "library-stats";

export interface LibraryStatsState {
  bookCount: number;
}

/**
 * What the library has counted so far. The read side of the domain: it records
 * what already happened and refuses nothing.
 *
 * Unlike `Book` or `Loan` it emits no events and enforces no rules, because
 * nothing decides anything here — `StatsReport` folds events into it, and the
 * only question it answers is how many.
 */
export class LibraryStats extends DomainEntity<LibraryStatsState> {
  private constructor(id: string, state: LibraryStatsState) {
    super(id, state);
  }

  static fromState(id: string, state: LibraryStatsState) {
    return new LibraryStats(id, state);
  }

  /** A library that has counted nothing yet. */
  static start() {
    return new LibraryStats(LIBRARY_STATS_ID, { bookCount: 0 });
  }

  /** One more copy joined the collection. */
  recordBookAdded() {
    this.state.bookCount++;
  }

  bookCount(): number {
    return this.state.bookCount;
  }
}
