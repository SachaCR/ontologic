export interface IListenerConnector {
  onMessage(handler: (message: ReceivedMessage) => Promise<void>): void
  status: "STARTED" | "STOPPED"
  start(): Promise<void>
  stop(): Promise<void>
  onError(handler: (error:unknown) => void): void
}

export interface IPublisherConnector {
  publish(name: string, message: string): Promise<void>
  status: "STARTED" | "STOPPED"
  start(): Promise<void>
  stop(): Promise<void>
  onError(handler: (error:unknown) => void): void 
}

export interface ReceivedMessage {
  name: string;
  content: string;
  ack(): Promise<void>;
  nack(): Promise<void>;
}
