export interface DomainEvent {
  name: string;
  version: number;
  entityId: string;
  payload: unknown;
}
