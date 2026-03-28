import { DomainEventInterface } from "../../domainEvent";
import { EventMetadata } from "../../repository";
import { EventHandler } from "../interfaces";

export interface ListenerConnector {
  status: "STARTED" | "STOPPED"
  start(): Promise<void>
  stop(): Promise<void>
  listenTo(eventName: string | '*', handler: EventHandler<DomainEventInterface>): void
  onError(handler: (error:unknown) => void): void
}

export interface PublisherConnector {
  status: "STARTED" | "STOPPED"
  start(): Promise<void>
  stop(): Promise<void>
  publish(event: DomainEventInterface, metadata: EventMetadata): Promise<void>
  onError(handler: (error:unknown) => void): void 
}
