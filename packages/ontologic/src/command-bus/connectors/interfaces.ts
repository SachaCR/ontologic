export interface IListenerConnector extends BusConnector {
  onMessage(handler: (message: ReceivedMessage) => Promise<void>): void;
  topicName(): string;
}

export interface IOrderedListenerConnector extends BusConnector {
  onMessage(handler: (message: ReceivedMessage) => Promise<void>): void;
}

export interface IOrderedPublisherConnector extends BusConnector {
  publish(message: unknown, options?: { orderingKey?: string }): Promise<void>;
}

export interface IDynamicPublisherConnector extends BusConnector {
  publish(params: { to: string; message: unknown }): Promise<void>;
}

export interface ReceivedMessage {
  /**
   * The payload of the message.
   */
  data: unknown;
  ack: () => void;

  /**
   * Rejects the message, indicating a failure in processing.
   */
  nack: () => void;
}

interface BusConnector {
  status: "STARTED" | "STOPPED";
  start(): Promise<void>;
  stop(): Promise<void>;
  onError(handler: (error: Error) => void): void;
  checkConnection(): Promise<boolean>;
}
