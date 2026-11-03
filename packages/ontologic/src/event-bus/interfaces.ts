import { DomainEventInterface } from "../domainEvent";
import { EventMetadata } from "../repository";
import { type BusComponent } from "../messaging";
import {
  type IListenerConnector,
  type IOrderedListenerConnector,
  type IOrderedPublisherConnector,
  type IPublisherConnector,
} from "../bus-connectors";

/**
 * Whether events are published in order is the caller's choice: sometimes the
 * order of events matters to a consumer, sometimes it does not. An ordered
 * publisher requires an `orderingKey` on every publish.
 */
export type EventBusPublisherConnector =
  | IPublisherConnector
  | IOrderedPublisherConnector;

/**
 * Same choice on the consuming side: an ordered listener hands a key's events
 * over one after the other, a plain one in whatever order they come.
 */
export type EventBusListenerConnector =
  | IListenerConnector
  | IOrderedListenerConnector;

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
