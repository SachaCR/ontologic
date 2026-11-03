import {
  RedisDynamicPublisher,
  RedisListener,
  RedisOrderedListener,
  RedisOrderedPublisher,
} from "@ontologics/redis-connectors";
import { type CommandBusConnectors } from "ontologic";

/**
 * The Redis half of a command bus, both channels on Redis.
 *
 * Note the asymmetry, which is the whole design rather than an oversight:
 * commands go through a *stream* with a consumer group, because a command is
 * not volatile — someone is blocked waiting for its answer, and it must survive
 * a handler crashing. Responses go through *pub/sub*, because by the time one
 * is late its caller has already timed out, so there is nothing worth
 * redelivering.
 */
export class RedisCommandBusConnectors implements CommandBusConnectors {
  commandOrderedListener: RedisOrderedListener;
  commandOrderedPublisher: RedisOrderedPublisher;
  responseListener: RedisListener;
  responseDynamicPublisher: RedisDynamicPublisher;

  constructor(params: {
    redisUrl: string;
    /** The stream commands go through. Shared by every emitter and receiver. */
    commandTopic: string;
    /** This emitter's own response channel. */
    responseTopic: string;
    /** Caps how long stop() waits on the stream read loop. */
    blockMs?: number;
    /** This receiver's name in the stream's consumer group. Unique per receiver. */
    consumerName?: string;
  }) {
    this.commandOrderedListener = new RedisOrderedListener({
      topicName: params.commandTopic,
      redisUrl: params.redisUrl,
      ...(params.blockMs === undefined ? {} : { blockMs: params.blockMs }),
      ...(params.consumerName === undefined
        ? {}
        : { consumerName: params.consumerName }),
    });

    this.commandOrderedPublisher = new RedisOrderedPublisher({
      topicName: params.commandTopic,
      redisUrl: params.redisUrl,
    });

    this.responseListener = new RedisListener({
      topicName: params.responseTopic,
      redisUrl: params.redisUrl,
    });

    this.responseDynamicPublisher = new RedisDynamicPublisher({
      redisUrl: params.redisUrl,
    });
  }

  /**
   * Closes every client, whatever state it reached.
   *
   * `stop()` returns early on a connector that never started, so this is safe
   * after a partial start, and for a process that only started one side.
   * Failures are swallowed: a teardown problem must not mask what went wrong
   * before it.
   */
  async disconnect(): Promise<void> {
    await Promise.all(
      [
        this.commandOrderedListener,
        this.commandOrderedPublisher,
        this.responseListener,
        this.responseDynamicPublisher,
      ].map((connector) => connector.stop().catch(() => {})),
    );
  }
}
