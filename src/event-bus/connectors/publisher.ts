import { DomainEventInterface } from "../../domainEvent";
import { EventMetadata } from "../../repository";

export interface PublisherConnector {
  start(): Promise<void>

  stop(): Promise<void>

  publish(event: DomainEventInterface, metadata: EventMetadata): Promise<void>

  onError(handler: (error:unknown) => void): void

  status: "STARTED" | "STOPPED"
}
