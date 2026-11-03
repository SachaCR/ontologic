import { hostname } from "node:os";
import { type CommandBusConnectors } from "ontologic";

import { RedisCommandBusConnectors } from "./redis";
import { SqsCommandBusConnectors } from "./sqs";

export { RedisCommandBusConnectors } from "./redis";
export { SqsCommandBusConnectors } from "./sqs";

/**
 * The transports the CLI runs over. In-memory is not one of them: its
 * listeners broadcast every message to every subscriber, so several receivers
 * would each handle every command. It stays available to the tests through
 * `InMemoryCommandBusConnectors`.
 */
export type Transport = "redis" | "sqs";

export const TRANSPORTS: readonly Transport[] = ["redis", "sqs"];

export interface TransportConfig {
  redisUrl: string;
  /** The stream (Redis) or FIFO queue name (SQS) commands go through. */
  commandTopic: string;
  region: string;
  sqsEndpoint?: string;
}

/** A connector set, and how to release whatever it opened. */
export interface ConnectorSet {
  connectors: CommandBusConnectors;
  disconnect: () => Promise<void>;
}

/**
 * A name unique to one instance across processes: its host, its pid, and its
 * name within the process, e.g. `emitter-1`.
 */
export function instanceId(instance: string): string {
  return `${hostname()}-${process.pid}-${instance}`;
}

/**
 * The connectors one emitter or one receiver instance needs.
 *
 * Every instance gets its own set. An emitter's response topic must be its own,
 * so that several emitters can share the receivers: each receiver replies to
 * the topic that came with the command. A receiver's Redis consumer name must
 * be its own too, so the consumer group spreads commands across receivers.
 */
export function createConnectors(
  transport: Transport,
  config: TransportConfig,
  /** This instance's name within the process, e.g. `receiver-2`. */
  instance: string,
): ConnectorSet {
  const id = instanceId(instance);

  switch (transport) {
    case "redis": {
      const connectors = new RedisCommandBusConnectors({
        redisUrl: config.redisUrl,
        commandTopic: config.commandTopic,
        responseTopic: `responses-${id}`,
        consumerName: `consumer-${id}`,
      });

      return { connectors, disconnect: () => connectors.disconnect() };
    }

    case "sqs": {
      const connectors = new SqsCommandBusConnectors({
        redisUrl: config.redisUrl,
        queueName: config.commandTopic,
        responseTopic: `responses-${id}`,
        region: config.region,
        // Created on demand so a fresh LocalStack works without setup. Against
        // real AWS, queues are usually infrastructure: no endpoint, no create.
        ensureQueue: config.sqsEndpoint !== undefined,
        // stop() lets the long poll in progress finish, so this bounds how long
        // Ctrl+C takes on a receiver. 20s (the SQS maximum) is cheaper on real
        // AWS; 5s keeps the CLI responsive.
        waitTimeSeconds: 5,
        ...(config.sqsEndpoint === undefined
          ? {}
          : { sqsEndpoint: config.sqsEndpoint }),
      });

      return { connectors, disconnect: () => connectors.disconnect() };
    }
  }
}
