export interface MessageRelayStateRepository {
  lock(params: { entityId: string; entityName: string }): Promise<void>;

  unlock(params: { entityId: string; entityName: string }): Promise<void>;

  getLastEventIdPublished(params: {
    entityId: string;
    entityName: string;
  }): Promise<string | undefined>;

  updateLastEventIdPublished(params: {
    eventId: string;
    entityId: string;
    entityName: string;
  }): Promise<void>;
}
