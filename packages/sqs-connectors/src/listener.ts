import type { IListenerConnector } from "ontologic";

import { assertStandardQueueName } from "./client";
import { SqsListenerBase, type SqsListenerOptions } from "./listenerBase";

export type { SqsListenerOptions } from "./listenerBase";

/**
 * Consumes an SQS standard queue, with no ordering: messages run in parallel,
 * up to `maxInFlight`.
 *
 * For event consumers that do not need events in order. Use
 * `SqsOrderedListener` on a FIFO queue when they do.
 *
 * A nacked message, or one whose handler throws, is given
 * `nackVisibilitySeconds` of visibility and delivered again after it. With no
 * order to protect, nothing else waits for it.
 */
export class SqsListener extends SqsListenerBase implements IListenerConnector {
  public readonly name: string = "SQS/Listener";
  public readonly kind = "listener";

  constructor(options: SqsListenerOptions) {
    assertStandardQueueName("SQS/Listener", options.queueName);
    super(options);
  }
}
