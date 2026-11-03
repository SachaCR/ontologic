import { EventMetadata } from "../repository";
import { validateMessageMetadata } from "../messaging/wireGuards";

export function validateMetadata(metadata: unknown): EventMetadata {
  if (!metadata) {
    throw new Error("Null or undefined event metadata");
  }

  if (typeof metadata !== "object") {
    throw new Error("Invalid Metadata");
  }

  const messageMetadataResult = validateMessageMetadata(metadata);

  if (messageMetadataResult.isErr()) {
    throw messageMetadataResult.error;
  }

  const typedMetadata = metadata as EventMetadata;

  if (typedMetadata.offset !== undefined) {
    if (typeof typedMetadata.offset !== "number") {
      throw new Error(
        "Invalid Metadata: offset is neither a number or undefined",
      );
    }
    if (!Number.isFinite(typedMetadata.offset)) {
      throw new Error("Invalid Metadata: offset must be a finite number");
    }
  }

  return typedMetadata;
}
