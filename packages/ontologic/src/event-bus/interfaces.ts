import { DomainEventInterface } from "../domainEvent";
import { EventMetadata } from "../repository";
import { type BusComponent } from "../messaging";

export interface IDomainEventBusPublisher<
  Event extends DomainEventInterface,
> extends BusComponent {
  publish(
    event: Event,
    metadata: EventMetadata,
    options?: { orderingKey?: string },
  ): Promise<void>;
}

export interface IDomainEventBusListener<
  Event extends DomainEventInterface,
> extends BusComponent {
  listenTo<EventName extends Event["name"]>(
    eventName: EventName | "*",
    handler: EventHandler<Extract<Event, { name: EventName }>>,
  ): void;
}

export type EventHandler<Event extends DomainEventInterface> = (
  event: Event,
  metadata: EventMetadata,
) => void | Promise<void>;
