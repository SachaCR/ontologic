import { IDomainEventBusListener, ReadModel } from "ontologic";

import { BookCreatedEvent, BookLostEvent } from "../entities/book";
import { LoanCreatedEvent, LoanReturnedEvent } from "../entities/loan";
import { LIBRARY_STATS_ID, LibraryStats } from "../entities/libraryStats";
import { StatsRegister } from "../repositories/statsRegister.repository";

/**
 * Every event the library publishes.
 *
 * Written out as the four classes rather than as `BookEvent | LoanEvent`: the
 * union is what declares the vocabulary this read model is allowed to hear, and
 * naming the events is the point of saying it.
 */
export type LibraryEvent =
  | BookCreatedEvent
  | BookLostEvent
  | LoanCreatedEvent
  | LoanReturnedEvent;

/**
 * How many copies the library has taken in, kept up to date by listening rather
 * than by counting rows.
 */
export class StatsReport implements ReadModel<LibraryEvent> {
  constructor(private readonly statsRegister: StatsRegister) {}

  /**
   * Whoever owns the listener calls this once, before starting it — handlers
   * registered after the start never run. In the application that is
   * StatsReportInitializer; in a test it is the test itself, which is why this
   * class needs no framework to exercise.
   */
  subscribe(listener: IDomainEventBusListener<LibraryEvent>) {
    listener.listenTo("BOOK_CREATED", async () => {
      const lookup = await this.statsRegister.getById(LIBRARY_STATS_ID);

      if (lookup.isErr()) {
        throw lookup.error;
      }

      // First event of the library's life: there is nothing to load yet.
      const stats = lookup.value ?? LibraryStats.start();

      stats.recordBookAdded();

      const saved = await this.statsRegister.saveWithEvents(stats, []);

      if (saved.isErr()) {
        throw saved.error;
      }
    });
  }
}
