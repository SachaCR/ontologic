export interface IDomainEvent {
  name: string;
  version: number;
  entityId: string;
  payload: unknown;
}

export class DomainEvent<Name extends string, Version extends number, Payload> implements IDomainEvent {
  #entityId: string;
  #name: Name;
  #version: Version;
  #payload: Payload;

  constructor(params: { entityId: string, name: Name, version: Version, payload: Payload }) {
    const { name, version, payload, entityId } = params;
    this.#entityId = entityId;
    this.#name = name;
    this.#version = version;
    this.#payload = payload; // TODO: Verify it's JSON compatible
  }

  get entityId(): string {
    return this.#entityId;
  }

  get name(): Name {
    return this.#name;
  }

  get version(): Version {
    return this.#version;
  }

  payload(): Payload {
    return structuredClone(this.#payload);
  }
}
