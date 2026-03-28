import { DomainEventInterface } from "../domainEvent";

export interface DomainEventBus<Event extends DomainEventInterface> {
  start(): void | Promise<void>

  stop(): void | Promise<void>

  listenTo(eventName: string, handler: (event: Event) => void): void

  publish(event: Event): Promise<void>
}
