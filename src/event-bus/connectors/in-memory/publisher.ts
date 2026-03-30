
import { EventEmitter } from "node:events";
import { IPublisherConnector } from "../interfaces";

export class InMemoryPublisherConnector implements IPublisherConnector {

  #status: "STARTED"|"STOPPED";
  #eventEmitter: EventEmitter;

  constructor(eventEmitter: EventEmitter) {
    this.#status = "STOPPED";
    this.#eventEmitter = eventEmitter; 
  }

  publish(name: string, message: string): Promise<void> {
    this.#eventEmitter.emit('message', { name, content:message });
    return Promise.resolve();
  }

  get status():"STARTED"|"STOPPED" {
    return this.#status; 
  }

  start() {
    this.#status = "STARTED"
    return Promise.resolve();
  }

  stop(){
    this.#status = "STOPPED"
    return Promise.resolve();
  }

  onError(handler: (error:unknown) => void): void {
    this.#eventEmitter.on('error', handler);
  }

}
