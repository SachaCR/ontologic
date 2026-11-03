import { type ErrorHandler } from "../messaging";

/**
 * Which role a connector plays on a bus.
 *
 * Several of the interfaces below are otherwise structurally identical — a
 * listener and an ordered listener have exactly the same members — so without a
 * discriminator TypeScript accepts either wherever the other is asked for. That
 * is not hypothetical: a pub/sub listener wired in where a stream consumer
 * belonged type-checked cleanly and failed only as a timeout at runtime.
 */
export type BusConnectorKind =
  | "listener"
  | "ordered-listener"
  | "publisher"
  | "ordered-publisher"
  | "dynamic-publisher";

/**
 * What both listener kinds share. They differ only by `kind`, which is the
 * whole point: it keeps one from being accepted where the other is required.
 */
export interface MessageListenerConnector extends BusConnector {
  onMessage(handler: (message: ReceivedMessage) => Promise<void>): void;
  topicName(): string;
}

export interface IListenerConnector extends MessageListenerConnector {
  readonly kind: "listener";
}

export interface IOrderedListenerConnector extends MessageListenerConnector {
  readonly kind: "ordered-listener";
}

export interface ReceivedMessage {
  content: string;
  ack(): Promise<void>;
  nack(): Promise<void>;
}

export interface IPublisherConnector extends BusConnector {
  readonly kind: "publisher";
  publish(message: string, options?: { orderingKey?: string }): Promise<void>;
}

export interface IOrderedPublisherConnector extends BusConnector {
  readonly kind: "ordered-publisher";
  publish(message: string, options: { orderingKey: string }): Promise<void>;
}

export interface IDynamicPublisherConnector extends BusConnector {
  readonly kind: "dynamic-publisher";
  publishTo(params: { topicName: string; message: string }): Promise<void>;
}

export type BusConnectorStatus = "STARTED" | "STOPPED";

export interface BusConnector {
  readonly kind: BusConnectorKind;
  status: BusConnectorStatus;
  start(): Promise<void>;
  stop(): Promise<void>;
  onError(handler: ErrorHandler): void;
  checkConnection(): Promise<boolean>;
}

/**
 * The four connectors a command bus needs, in one bundle.
 *
 * A command bus is two one-way channels, not one duplex channel:
 *
 *   commands   emitter  --ordered publish-->  receiver   (one topic, ordered)
 *   responses  receiver --dynamic publish-->  emitter    (one topic per emitter)
 *
 * The response side is dynamic because the emitter names its own response
 * topic in every command it sends, and the receiver replies to whatever name it
 * was given. That is what lets many emitters share one receiver.
 */
export interface CommandBusConnectors {
  commandOrderedListener: IOrderedListenerConnector;
  commandOrderedPublisher: IOrderedPublisherConnector;
  responseListener: IListenerConnector;
  responseDynamicPublisher: IDynamicPublisherConnector;
}
