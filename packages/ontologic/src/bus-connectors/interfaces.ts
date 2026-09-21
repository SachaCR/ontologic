export interface IListenerConnector extends BusConnector {
  onMessage(handler: (message: ReceivedMessage) => Promise<void>): void;
  topicName(): string;
}

export interface IOrderedListenerConnector extends BusConnector {
  onMessage(handler: (message: ReceivedMessage) => Promise<void>): void;
  topicName(): string;
}

export interface ReceivedMessage {
  content: string;
  ack(): Promise<void>;
  nack(): Promise<void>;
}

export interface IPublisherConnector extends BusConnector {
  publish(message: string, options?: { orderingKey?: string }): Promise<void>;
}

export interface IOrderedPublisherConnector extends BusConnector {
  publish(message: string, options: { orderingKey: string }): Promise<void>;
}

export interface IDynamicPublisherConnector extends BusConnector {
  publishTo(params: { topicName: string; message: string }): Promise<void>;
}

export type BusConnectorStatus = "STARTED" | "STOPPED";

export interface BusConnector {
  status: BusConnectorStatus;
  start(): Promise<void>;
  stop(): Promise<void>;
  onError(handler: (error: Error) => void): void;
  checkConnection(): Promise<boolean>;
}
