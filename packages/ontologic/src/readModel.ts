import { DomainEventInterface } from "./domainEvent";
import { IDomainEventBusListener } from "./event-bus/interfaces";

/**
 * A view built from events rather than written to directly — the read side.
 *
 * A read model subscribes to the events it cares about and folds them into
 * whatever shape answers its question. It owns no domain rules and refuses
 * nothing: aggregates decide what may happen, and a read model only records
 * that it did.
 *
 * ```ts
 * export class BookCountService implements ReadModel<LibraryEvent> {
 *   private bookCount = 0;
 *
 *   subscribe(listener: IDomainEventBusListener<LibraryEvent>) {
 *     listener.listenTo("BOOK_CREATED", () => {
 *       this.bookCount++;
 *     });
 *   }
 *
 *   getBookCount(): number {
 *     return this.bookCount;
 *   }
 * }
 * ```
 *
 * `subscribe` exists rather than leaving registration to a framework hook for
 * two reasons. Handlers must be registered before `listener.start()`, and
 * naming the step keeps that ordering in the read model instead of in whatever
 * container happens to host it — so the same class can be wired by hand in a
 * test. It also gives tooling one place to look: `domain-explorer` reads the
 * `listenTo` calls in here to work out which events this view is built from.
 *
 * `Events` is the union the read model may listen to. Declaring it wider than
 * what `subscribe` actually registers is allowed and sometimes deliberate — the
 * gap between the two is visible in the generated documentation.
 */
export interface ReadModel<Events extends DomainEventInterface> {
  subscribe(listener: IDomainEventBusListener<Events>): void;
}
