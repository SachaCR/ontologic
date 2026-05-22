import { DomainEventInterface } from "../domainEvent";
import { EventMetadata } from "../repository";

export interface IDomainEventBusPublisher<Event extends DomainEventInterface> {
  start(): void | Promise<void>;
  stop(): void | Promise<void>;
  publish(event: Event, metadata: EventMetadata): Promise<void>;
}

export interface IDomainEventBusListener<Event extends DomainEventInterface> {
  start(): void | Promise<void>;
  stop(): void | Promise<void>;
  listenTo<EventName extends Event["name"]>(
    eventName: EventName | "*",
    handler: EventHandler<Extract<Event, { name: EventName }>>,
  ): void;
}

export type EventHandler<Event extends DomainEventInterface> = (
  event: Event,
  metadata: EventMetadata,
) => void | Promise<void>;
