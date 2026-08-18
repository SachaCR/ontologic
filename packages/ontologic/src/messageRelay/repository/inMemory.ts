import { MessageRelayStateRepository } from "../interfaces";

export class InMemoryMessageRelayStateRepository implements MessageRelayStateRepository {
  private store = new Map<Key, MessageRelayState>();

  async lock({
    entityId,
    entityName,
  }: {
    entityId: string;
    entityName: string;
  }) {
    const key = toKey(entityId, entityName);
    const state = this.store.get(key);

    if (state?.publishingStatus === "IN_PROGRESS") {
      throw new Error(
        `[MESSAGE RELAY REPOSITORY]: Lock already held for ${key}`,
      );
    }

    this.store.set(key, {
      ...(state ?? { entityId, entityName, lastEventPublished: "" }),
      publishingStatus: "IN_PROGRESS",
    });
  }

  async unlock({
    entityId,
    entityName,
  }: {
    entityId: string;
    entityName: string;
  }) {
    const key = toKey(entityId, entityName);
    const state = this.store.get(key);

    if (!state) {
      throw new Error(
        `[MESSAGE RELAY REPOSITORY]: No publishing state found for ${key}`,
      );
    }

    this.store.set(key, { ...state, publishingStatus: "IDLE" });
  }

  async getLastEventIdPublished({
    entityId,
    entityName,
  }: {
    entityId: string;
    entityName: string;
  }): Promise<string | undefined> {
    return this.store.get(toKey(entityId, entityName))?.lastEventPublished;
  }

  async updateLastEventIdPublished({
    eventId,
    entityId,
    entityName,
  }: {
    eventId: string;
    entityId: string;
    entityName: string;
  }) {
    const key = toKey(entityId, entityName);
    const state = this.store.get(key);

    if (!state) {
      throw new Error(
        `[MESSAGE RELAY REPOSITORY]: No publishing state found for ${key}`,
      );
    }

    this.store.set(key, { ...state, lastEventPublished: eventId });
  }
}

interface MessageRelayState {
  entityId: string;
  entityName: string;
  lastEventPublished: string;
  publishingStatus: "IDLE" | "IN_PROGRESS" | "FAILED";
}

type Key = `${string}:${string}`;

function toKey(entityId: string, entityName: string): Key {
  return `${entityName}:${entityId}`;
}
