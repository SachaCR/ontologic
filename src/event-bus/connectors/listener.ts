
import { DomainEventInterface } from "../../domainEvent";
import { EventHandler } from "../interfaces";

export interface ListenerConnector {
  start(): Promise<void>

  stop(): Promise<void>

  listenTo(eventName: string | '*', handler: EventHandler<DomainEventInterface>): void

  onError(handler: (error:unknown) => void): void

  status: "STARTED" | "STOPPED"
}
