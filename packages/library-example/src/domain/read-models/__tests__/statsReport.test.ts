import { beforeEach, describe, expect, it } from "vitest";
import { EventHandler, EventMetadata, IDomainEventBusListener } from "ontologic";

import { LibraryEvent, StatsReport } from "../statsReport.read-model";
import { StatsRegister } from "../../repositories/statsRegister.repository";
import { LIBRARY_STATS_ID } from "../../entities/libraryStats";
import { BookCreatedEvent } from "../../entities/book";

/**
 * A listener that records what was registered instead of talking to a broker.
 *
 * This is what `subscribe` buys: the projection can be driven directly, with no
 * bus, no connectors and no framework.
 */
class CapturingListener implements IDomainEventBusListener<LibraryEvent> {
  private handlers = new Map<string, EventHandler<LibraryEvent>>();

  listenTo(eventName: string, handler: EventHandler<never>) {
    this.handlers.set(eventName, handler as EventHandler<LibraryEvent>);
  }

  start() {}
  stop() {}

  async deliver(event: LibraryEvent) {
    const handler = this.handlers.get(event.name);
    if (!handler) throw new Error(`nothing listening for ${event.name}`);
    await handler(event, {} as EventMetadata);
  }
}

function aBookCreated() {
  return new BookCreatedEvent("book-1", {
    title: "Dune",
    author: "Frank Herbert",
    isbn: "978-0441013593",
    category: "fiction",
    tags: [],
    lost: false,
  });
}

describe("Given a stats report subscribed to the library's events", () => {
  let statsRegister: StatsRegister;
  let listener: CapturingListener;

  beforeEach(() => {
    statsRegister = new StatsRegister();
    listener = new CapturingListener();

    new StatsReport(statsRegister).subscribe(listener);
  });

  describe("When two copies are reported as added to the collection", () => {
    beforeEach(async () => {
      await listener.deliver(aBookCreated());
      await listener.deliver(aBookCreated());
    });

    it("Then the report has counted two", async () => {
      const lookup = await statsRegister.getById(LIBRARY_STATS_ID);

      expect(lookup.isOk()).toBe(true);
      if (lookup.isOk()) {
        expect(lookup.value?.bookCount()).toBe(2);
      }
    });
  });

  describe("When nothing has happened yet", () => {
    it("Then there is no tally to read", async () => {
      const lookup = await statsRegister.getById(LIBRARY_STATS_ID);

      expect(lookup.isOk()).toBe(true);
      if (lookup.isOk()) {
        expect(lookup.value).toBeUndefined();
      }
    });
  });
});
