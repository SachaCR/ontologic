import { EventProjection } from "@ontologics/event-sourcing";
import { IDomainEventBusListener, ReadModel } from "ontologic";

import { BookCreatedEvent, BookLostEvent } from "../entities/book";
import { LoanCreatedEvent, LoanReturnedEvent } from "../entities/loan";
import {
  LIBRARY_STATS_ID,
  LibraryStats,
  LibraryStatsState,
} from "../entities/libraryStats";
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
 * How the tally moves, one applier per event.
 *
 * `BookCreatedEvent` is one of `ontologic`'s `DomainEvent`s, and satisfies
 * `SourceEvent` structurally — it exposes `name`, `version` and `payload` — so
 * it folds with no translation step.
 *
 * The type argument is the single event this report subscribes to rather than
 * the whole of `LibraryEvent`. The applier map is exhaustive, so widening it
 * would mean writing `({ state }) => state` three times for events this report
 * has no opinion about. Narrow instead, and the compiler keeps the two in step.
 */
const statsProjection = new EventProjection<
  LibraryStatsState,
  BookCreatedEvent
>({
  name: "LibraryStats",
  appliers: {
    BOOK_CREATED: ({ state }) => ({ bookCount: state.bookCount + 1 }),
  },
});

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
    listener.listenTo("BOOK_CREATED", async (event) => {
      const lookup = await this.statsRegister.getById(LIBRARY_STATS_ID);

      if (lookup.isErr()) {
        throw lookup.error;
      }

      // First event of the library's life: there is nothing to load yet, so
      // the fold starts from the tally's empty shape.
      const current = (lookup.value ?? LibraryStats.start()).readState();

      // `apply` also returns a version — how many events it folded. There is
      // nowhere to keep it here: this report is driven one event at a time off
      // the bus, and `InMemoryRepository` has no slot for a checkpoint. A real
      // event store would persist it beside the state, so a restart could
      // resume rather than replay.
      const { state } = statsProjection.apply({
        snapshot: { state: current, version: 0 },
        events: [event],
      });

      const saved = await this.statsRegister.saveWithEvents(
        LibraryStats.fromState(LIBRARY_STATS_ID, state),
        [],
      );

      if (saved.isErr()) {
        throw saved.error;
      }
    });
  }
}
