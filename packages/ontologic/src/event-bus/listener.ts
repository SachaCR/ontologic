import { IListenerConnector, ReceivedMessage } from "./connectors/interfaces";
import { EventHandler, IDomainEventBusListener } from "./interfaces";
import { DomainEventInterface } from "../domainEvent";
import { EventEmitter } from "node:events";
import { validateMetadata } from "./validateMetadata";

export class DomainEventBusListener<
  Event extends DomainEventInterface,
> implements IDomainEventBusListener<Event> {
  #listenerConnector: IListenerConnector;
  #eventHandlersMap: Map<Event["name"] | "*", EventHandler<Event>>;
  #eventEmitter: EventEmitter;
  #validator: (event: unknown) => Event;

  constructor(params: {
    listenerConnector: IListenerConnector;
    options: { validator: (event: unknown) => Event };
  }) {
    const { listenerConnector, options } = params;

    if (!listenerConnector) {
      throw new Error(
        "[DomainEventBusListener] Must have a listener connector",
      );
    }

    this.#listenerConnector = listenerConnector;
    this.#eventHandlersMap = new Map<
      Event["name"] | "*",
      EventHandler<Event>
    >();
    this.#eventEmitter = new EventEmitter({
      captureRejections: true,
    });

    this.#validator = options.validator;
  }

  listenTo<EventName extends Event["name"]>(
    eventName: EventName | "*",
    handler: EventHandler<Extract<Event, { name: EventName }>>,
  ): void {
    this.#eventHandlersMap.set(eventName, handler as EventHandler<Event>);
  }

  async start() {
    if (this.#eventHandlersMap.size === 0) {
      throw new Error(
        "[DomainEventBusListener]: Cannot start the listener if you have no listener registered. Use listenTo() before start()",
      );
    }

    this.#listenerConnector.onMessage(async (message: ReceivedMessage) => {
      const eventHandler =
        this.#eventHandlersMap.get(message.name) ??
        this.#eventHandlersMap.get("*");

      if (!eventHandler) {
        // Nothing here subscribed to this event, which is the ordinary result of
        // `listenTo` being per event name — a consumer takes what it needs, and
        // `listenTo("*")` is there for the ones that want everything.
        //
        // So this is not a failure, and nacking would be wrong twice over: a
        // nack asks the broker to deliver again, and the second attempt would
        // meet the same missing handler, forever. Redelivery loops and
        // dead-letter queues full of other people's events both come from that.
        this.#eventEmitter.emit("unhandled", message.name);
        await message.ack();
        return;
      }

      try {
        const { event, metadata } = JSON.parse(message.content);

        const eventToHandle = this.#validator(event);
        const validatedMetadata = validateMetadata(metadata);

        await eventHandler(eventToHandle, validatedMetadata);
        await message.ack();
      } catch (error) {
        // Deserialisation, validation and handler failures are all genuine
        // failures, so they nack — and say why. Contrast the branch above: an
        // event nobody subscribed to is acked and reported through
        // `onUnhandled`, because that is not a failure at all.
        //
        // Reported before the nack, so the reason survives even if the nack
        // itself fails.
        this.#eventEmitter.emit("failure", error);
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
    // Deliberately not the "error" channel: Node throws an 'error' event that
    // has no listener, so emitting on it would turn "we nacked, here is why"
    // into an unhandled exception for anyone who never called this.
    this.#eventEmitter.on("failure", handler);
  }

  /**
   * Called with the name of an event that reached this listener with no handler
   * registered for it.
   *
   * Separate from `onError` on purpose: an unsubscribed event is a normal
   * outcome, not a failure, and a consumer with selective subscriptions would
   * otherwise see a constant stream of non-errors. Register this when you want
   * to notice a handler you forgot to wire.
   */
  onUnhandled(handler: (eventName: string) => void): void {
    this.#eventEmitter.on("unhandled", handler);
  }
}
