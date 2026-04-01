import {IListenerConnector, ReceivedMessage} from "./connectors/interfaces";
import { EventHandler, IDomainEventBusListener } from "./interfaces";
import { DomainEventInterface } from "../domainEvent";
import { EventEmitter } from "node:events";
import { validateMetadata } from "./validateMetadata";

export class DomainEventBusListener<Event extends DomainEventInterface>
  implements IDomainEventBusListener<Event> {
  #listenerConnector: IListenerConnector
  #eventHandlersMap: Map<Event["name"] | "*", EventHandler<Event>>;
  #eventEmitter: EventEmitter;
  #validator:  (event: unknown) => Event;

  constructor(params: {
    listenerConnector: IListenerConnector;
    options: { validator: (event: unknown) => Event; }
  }) {
    const { listenerConnector, options } = params;

    if (!listenerConnector) {
      throw new Error(
        "[DomainEventBusListener] Must have a listener connector",
      );
    }

    this.#listenerConnector = listenerConnector;
    this.#eventHandlersMap = new Map<Event["name"] | "*", EventHandler<Event>>()
    this.#eventEmitter = new EventEmitter({
      captureRejections: true
    })

    this.#validator = options.validator
  }

  listenTo<EventName extends Event["name"]>(eventName:EventName | '*', handler: EventHandler<Extract<Event, { name: EventName }>>): void {
    this.#eventHandlersMap.set(eventName, handler as EventHandler<Event>);
  }

  async start() {
    if(this.#eventHandlersMap.size === 0) {
      throw new Error("[DomainEventBusListener]: Cannot start the listener if you have no listener registered. Use listenTo() before start()")
    }

    this.#listenerConnector.onMessage(async (message: ReceivedMessage)=> {
      const eventHandler =
        this.#eventHandlersMap.get(message.name) ??
        this.#eventHandlersMap.get("*");

      if (!eventHandler) {
        this.#eventEmitter.emit("error", new Error("[DomainEventBusListener]: No event handler found"));
        await message.nack();
        return
      }

      const parsedMessage = JSON.parse(message.content);
      const { event, metadata } = parsedMessage;

      let eventToHandle = event;

        eventToHandle = this.#validator(event);

      const validatedMetadata = validateMetadata(metadata)

      try {
        await eventHandler(eventToHandle, validatedMetadata);
        await message.ack();
      } catch {
        await message.nack();
      }
    });

    await this.#listenerConnector.start();
  }

  async stop() {
    await this.#listenerConnector.stop();
  }

  status() {
    return this.#listenerConnector.status;
  }

  onError(handler: (error: unknown) => void): void {
    this.#listenerConnector.onError(handler);
    this.#eventEmitter.on("error", handler)
  }
}
