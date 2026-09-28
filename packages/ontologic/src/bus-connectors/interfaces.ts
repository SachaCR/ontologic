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

export interface IListenerConnector extends BusConnector {
  readonly kind: "listener";
  onMessage(handler: (message: ReceivedMessage) => Promise<void>): void;
  topicName(): string;
}

export interface IOrderedListenerConnector extends BusConnector {
  readonly kind: "ordered-listener";
  onMessage(handler: (message: ReceivedMessage) => Promise<void>): void;
  topicName(): string;
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
  onError(handler: (error: Error) => void): void;
  checkConnection(): Promise<boolean>;
}
