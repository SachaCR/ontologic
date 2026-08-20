import {
  DomainEvent,
  IDomainEventBusListener,
  ReadModel,
} from "ontologic";

/**
 * The three shapes an event consumer takes, kept as a fixture.
 *
 * Neither shipped corpus holds all three: `library-example` has one declared
 * read model and nothing else, and the four consumers in the workflow-v2
 * checkout are all wildcard functions — and that checkout is skipped whenever it
 * is absent, which is every machine but one.
 *
 * This file is never compiled against the workspace `ontologic`; it is only
 * parsed.
 */
export class ShelfCleared extends DomainEvent<"SHELF_CLEARED", 1, { shelf: string }> {
  constructor(entityId: string, payload: { shelf: string }) {
    super({ name: "SHELF_CLEARED", version: 1, entityId, payload });
  }
}

export class ShelfFilled extends DomainEvent<"SHELF_FILLED", 1, { shelf: string }> {
  constructor(entityId: string, payload: { shelf: string }) {
    super({ name: "SHELF_FILLED", version: 1, entityId, payload });
  }
}

export class ShelfPainted extends DomainEvent<"SHELF_PAINTED", 1, { shelf: string }> {
  constructor(entityId: string, payload: { shelf: string }) {
    super({ name: "SHELF_PAINTED", version: 1, entityId, payload });
  }
}

export type ShelfEvent = ShelfCleared | ShelfFilled | ShelfPainted;

/** Declared, and hears two of the three events its union admits. */
export class ShelfOccupancy implements ReadModel<ShelfEvent> {
  private occupied = new Set<string>();
  private observers: ((event: ShelfEvent) => void)[] = [];

  subscribe(listener: IDomainEventBusListener<ShelfEvent>) {
    listener.listenTo("SHELF_FILLED", (event) => {
      this.occupied.add(event.payload.shelf);
    });

    listener.listenTo("SHELF_CLEARED", (event) => {
      this.occupied.delete(event.payload.shelf);
    });
  }

  /** Notified after each fold. A registration, not a question. */
  onApplied(handler: (event: ShelfEvent) => void) {
    this.observers.push(handler);
  }

  countOccupied(): number {
    return this.occupied.size;
  }
}

/** Subscribes, but never says what it is — the `read-model-not-declared` case. */
export class ShelfAuditLog {
  private lines: string[] = [];

  attach(listener: IDomainEventBusListener<ShelfEvent>) {
    listener.listenTo("SHELF_PAINTED", (event) => {
      this.lines.push(event.name);
    });
  }
}

/** Hears everything, and is a plain function rather than a class. */
export function watchEverything(listener: IDomainEventBusListener<ShelfEvent>) {
  listener.listenTo("*", (event) => {
    console.log(event.name);
  });
}

/** Declared, but listening for a name nothing publishes. */
export class ShelfTypoWatcher implements ReadModel<ShelfEvent> {
  subscribe(listener: IDomainEventBusListener<ShelfEvent>) {
    listener.listenTo("SHELF_CLEANED" as "SHELF_CLEARED", () => {});
  }
}

/** Holds the view as a dependency and asks it something — the injected shape. */
export class ShelfDashboard {
  constructor(private readonly occupancy: ShelfOccupancy) {}

  render(): string {
    return "occupied: " + this.occupancy.countOccupied();
  }
}

/**
 * Builds its own view and asks it from a nested closure — the consumer-script
 * shape, and the reason bindings are collected per file rather than per scope.
 * The question belongs to `runShelfReport`; `repaint` is not a name worth
 * showing.
 */
export async function runShelfReport(
  listener: IDomainEventBusListener<ShelfEvent>,
) {
  const view = new ShelfOccupancy();

  const repaint = () => {
    console.log(view.countOccupied());
  };

  view.onApplied(() => repaint());
  view.subscribe(listener);
}

/** Wires a view up and never asks it anything, so it is not a reader of one. */
export function wireShelfOccupancy(
  view: ShelfOccupancy,
  listener: IDomainEventBusListener<ShelfEvent>,
) {
  view.onApplied((event) => console.log(event.name));
  view.subscribe(listener);
}
