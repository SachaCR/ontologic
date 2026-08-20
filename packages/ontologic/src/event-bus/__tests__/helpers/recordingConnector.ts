import { EventEmitter } from "node:events";

import type {
  IListenerConnector,
  ReceivedMessage,
} from "../../connectors/interfaces";

/**
 * A listener connector that records whether each message was acked or nacked.
 *
 * The in-memory connector's `ack` and `nack` are deliberate no-ops, so nothing
 * in the suite could observe them — which is why the dispatch path's ack/nack
 * decisions went unpinned. This exists to pin them.
 */
export class RecordingListenerConnector implements IListenerConnector {
  status: "STARTED" | "STOPPED" = "STOPPED";

  readonly acked: string[] = [];
  readonly nacked: string[] = [];

  #handler?: (message: ReceivedMessage) => Promise<void>;
  #errors = new EventEmitter();

  onMessage(handler: (message: ReceivedMessage) => Promise<void>): void {
    this.#handler = handler;
  }

  async start() {
    this.status = "STARTED";
  }

  async stop() {
    this.status = "STOPPED";
  }

  onError(handler: (error: unknown) => void): void {
    this.#errors.on("error", handler);
  }

  /** Hand the listener a message, as a broker would. */
  async deliver(name: string, content: string) {
    if (!this.#handler) throw new Error("deliver() before onMessage()");

    await this.#handler({
      name,
      content,
      ack: async () => {
        this.acked.push(name);
      },
      nack: async () => {
        this.nacked.push(name);
      },
    });
  }
}
