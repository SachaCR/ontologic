import {
  RedisDynamicPublisher,
  RedisListener,
} from "@ontologics/redis-connectors";
import {
  SqsOrderedListener,
  SqsOrderedPublisher,
  type SqsConnectionOptions,
} from "@ontologics/sqs-connectors";
import { type CommandBusConnectors } from "ontologic";

/** LocalStack accepts any credentials; only the endpoint matters. */
const LOCALSTACK_CREDENTIALS = {
  accessKeyId: "test",
  secretAccessKey: "test",
};

/**
 * Commands on SQS, responses on Redis.
 *
 * The split is the point, not a limitation. A command is durable work someone
 * is blocked waiting for, so it wants a FIFO queue with real delivery
 * guarantees. A response whose caller has already timed out is worth nothing,
 * so it wants a channel that costs nothing to create and nothing to clean up —
 * and SQS has no ephemeral queue primitive to offer, while a Redis pub/sub
 * channel is not even allocated until someone subscribes.
 */
export class SqsCommandBusConnectors implements CommandBusConnectors {
  commandOrderedListener: SqsOrderedListener;
  commandOrderedPublisher: SqsOrderedPublisher;
  responseListener: RedisListener;
  responseDynamicPublisher: RedisDynamicPublisher;

  constructor(params: {
    redisUrl: string;
    /** The FIFO queue commands go through. Must end in `.fifo`. */
    queueName: string;
    /** This emitter's own response channel, on Redis. */
    responseTopic: string;
    region: string;
    /** LocalStack, or unset for real AWS (ambient credentials). */
    sqsEndpoint?: string;
    /** Create the queue if it is missing. */
    ensureQueue?: boolean;
    /** Long-poll duration. Lower it in tests to keep an idle loop cheap. */
    waitTimeSeconds?: number;
  }) {
    const sqs: SqsConnectionOptions = {
      queueName: params.queueName,
      region: params.region,
      ensureQueue: params.ensureQueue ?? false,
      ...(params.sqsEndpoint === undefined
        ? {}
        : {
            endpoint: params.sqsEndpoint,
            credentials: LOCALSTACK_CREDENTIALS,
          }),
    };

    this.commandOrderedListener = new SqsOrderedListener({
      ...sqs,
      // A command that keeps crashing its receiver is dropped after five
      // deliveries, so it stops holding up the orders behind it.
      maxDeliveries: 5,
      ...(params.waitTimeSeconds === undefined
        ? {}
        : { waitTimeSeconds: params.waitTimeSeconds }),
    });

    this.commandOrderedPublisher = new SqsOrderedPublisher(sqs);

    this.responseListener = new RedisListener({
      topicName: params.responseTopic,
      redisUrl: params.redisUrl,
    });

    this.responseDynamicPublisher = new RedisDynamicPublisher({
      redisUrl: params.redisUrl,
    });
  }

  /**
   * Closes everything, whatever state it reached. `stop()` returns early on a
   * connector that never started, so this is safe after a partial start.
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
