import {
  CreateQueueCommand,
  GetQueueUrlCommand,
  SQSClient,
  type SQSClientConfig,
} from "@aws-sdk/client-sqs";

export interface SqsConnectionOptions {
  /** Must end in `.fifo` — SQS rejects a FIFO queue named anything else. */
  queueName: string;
  region?: string;
  /** Point at LocalStack, or leave unset for real AWS. */
  endpoint?: string;
  credentials?: { accessKeyId: string; secretAccessKey: string };
  /** Per-request retries. The SDK has no connect step, so there is no reconnect strategy. */
  maxAttempts?: number;
  /**
   * Create the queue on `start()` if it is missing, with the FIFO attributes
   * these connectors rely on. Off by default: production queues are usually
   * managed as infrastructure, and a typo would otherwise silently create a
   * second queue instead of failing.
   */
  ensureQueue?: boolean;
  /**
   * Only used when `ensureQueue` creates the queue.
   *
   * It has to exceed the slowest a handler can be. A message still in flight
   * when this expires is delivered again — double processing, and worse, its
   * whole message group unblocks early, which quietly breaks the ordering
   * guarantee that is the reason to be on FIFO at all.
   */
  visibilityTimeoutSeconds?: number;
}

/**
 * The SQS client every connector in this package builds the same way.
 *
 * The Redis equivalent (`redis/socketOptions.ts`) has to work around node-redis
 * retrying forever on connect. Nothing like that is needed here: an `SQSClient`
 * holds no connection, so there is no start-up hang to defend against — only
 * per-request retries, which `maxAttempts` bounds.
 */
export function createSqsClient(options: SqsConnectionOptions): SQSClient {
  const config: SQSClientConfig = {
    region: options.region ?? "us-east-1",
    maxAttempts: options.maxAttempts ?? 3,
  };

  if (options.endpoint !== undefined) {
    config.endpoint = options.endpoint;
  }

  if (options.credentials !== undefined) {
    config.credentials = options.credentials;
  }

  return new SQSClient(config);
}

/**
 * A FIFO queue name must carry the suffix; SQS refuses the `FifoQueue`
 * attribute otherwise. Checked in the constructor so a typo fails where it was
 * made rather than on the first publish.
 */
export function assertFifoQueueName(
  connectorName: string,
  queueName: string,
): void {
  if (!queueName.endsWith(".fifo")) {
    throw new Error(
      `[${connectorName}] A FIFO queue name must end in ".fifo", got "${queueName}"`,
    );
  }
}

/**
 * Turns a queue name into the URL every other SQS call needs.
 *
 * With `ensureQueue` this creates the queue, which is what the tests use and
 * the counterpart to `XGROUP CREATE ... MKSTREAM` on the Redis listener.
 * `CreateQueue` is idempotent for a name *and* attribute set that already
 * match, and errors when the attributes differ — so a queue created by hand
 * without `ContentBasedDeduplication` surfaces here rather than as mysteriously
 * rejected publishes.
 */
export async function resolveQueueUrl(
  connectorName: string,
  client: SQSClient,
  options: SqsConnectionOptions,
): Promise<string> {
  try {
    if (options.ensureQueue === true) {
      const created = await client.send(
        new CreateQueueCommand({
          QueueName: options.queueName,
          Attributes: {
            FifoQueue: "true",
            // The publisher sends no MessageDeduplicationId — it only ever sees
            // an opaque string and cannot read the command's id — so the queue
            // has to derive one by hashing the body.
            ContentBasedDeduplication: "true",
            VisibilityTimeout: String(options.visibilityTimeoutSeconds ?? 30),
          },
        }),
      );

      if (created.QueueUrl === undefined) {
        throw new Error("CreateQueue returned no QueueUrl");
      }

      return created.QueueUrl;
    }

    const found = await client.send(
      new GetQueueUrlCommand({ QueueName: options.queueName }),
    );

    if (found.QueueUrl === undefined) {
      throw new Error("GetQueueUrl returned no QueueUrl");
    }

    return found.QueueUrl;
  } catch (error: unknown) {
    throw new Error(
      `[${connectorName}] Failed to resolve queue "${options.queueName}"`,
      { cause: error },
    );
  }
}

/**
 * `MessageGroupId` and `MessageDeduplicationId` are both capped at 128
 * characters by SQS. Checking here turns an opaque API rejection into an error
 * that names the connector and the offending value.
 */
export function assertOrderingKey(
  connectorName: string,
  orderingKey: string,
): void {
  if (orderingKey.length === 0 || orderingKey.length > 128) {
    throw new Error(
      `[${connectorName}] orderingKey must be 1-128 characters, got ${orderingKey.length}`,
    );
  }
}
