import { EventMetadata } from "../repository";

export function validateMetadata(metadata: unknown): EventMetadata {
  if(!metadata) {
    throw new Error("Null or undefined event metadata");
  }

  if(typeof metadata !== 'object') {
    throw new Error("Invalid Metadata");
  }

  const typedMetadata = metadata as EventMetadata;

  if (typeof typedMetadata.id !== 'string') {
    throw new Error("Invalid Metadata: id is not a string");
  }

  if (typedMetadata.id.length === 0) {
    throw new Error("Invalid Metadata: id is an empty string");
  }

  if (typeof typedMetadata.createdAt !== "string") {
    throw new Error("Invalid Metadata: createdAt is not a string");
  }

  if (!isExactISODateTime(typedMetadata.createdAt)) {
    throw new Error("Invalid Metadata: createdAt is not a valid ISO date time string");
  }

  if (typedMetadata.offset !== undefined) {
    if (typeof typedMetadata.offset !== "number") {
      throw new Error("Invalid Metadata: offset is neither a number or undefined");
    }
    if (!Number.isFinite(typedMetadata.offset)) {
      throw new Error("Invalid Metadata: offset must be a finite number");
    }
  }

  return typedMetadata;
}


function isExactISODateTime(value: string): boolean {
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d+)?(Z|([+-]\d{2}:\d{2}))$/
  );
  if (!match) return false;

  const [_, y, m, d, h, min, s] = match;

  const date = new Date(value);

  return (
    !isNaN(date.getTime()) &&
    date.getUTCFullYear() === Number(y) &&
    date.getUTCMonth() + 1 === Number(m) &&
    date.getUTCDate() === Number(d) &&
    date.getUTCHours() === Number(h) &&
    date.getUTCMinutes() === Number(min) &&
    date.getUTCSeconds() === Number(s)
  );
}
