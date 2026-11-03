import { describe, it, expect } from "vitest";

import {
  isRecord,
  nonEmptyString,
  validateMessageMetadata,
} from "../wireGuards";

describe("isRecord", () => {
  it.each([
    ["null", null],
    ["an array", []],
    ["a string", "a"],
    ["undefined", undefined],
  ])("refuses %s", (_label, value) => {
    expect(isRecord(value)).toBe(false);
  });

  it("accepts a plain object", () => {
    expect(isRecord({ a: 1 })).toBe(true);
  });
});

describe("nonEmptyString", () => {
  it("returns null for a non-empty string", () => {
    expect(nonEmptyString({ id: "a" }, "id", "Shape")).toBeNull();
  });

  it("explains a value that is not a string", () => {
    expect(nonEmptyString({ id: 1 }, "id", "Shape")?.message).toBe(
      "Invalid Shape: id is not a string",
    );
  });

  it("explains an empty string", () => {
    expect(nonEmptyString({ id: "" }, "id", "Shape")?.message).toBe(
      "Invalid Shape: id is an empty string",
    );
  });
});

describe("validateMessageMetadata", () => {
  it("returns the same object, extra fields included", () => {
    const input = {
      id: "m-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      correlationId: "corr-1",
    };

    expect(validateMessageMetadata(input)._unsafeUnwrap()).toBe(input);
  });

  it("accepts a createdAt with a non-zero timezone offset", () => {
    const input = { id: "m-1", createdAt: "2026-01-15T08:30:45+05:30" };

    expect(validateMessageMetadata(input).isOk()).toBe(true);
  });

  it.each([
    ["not an object", null, "Invalid Metadata"],
    [
      "an id that is not a string",
      { id: 1, createdAt: "2026-01-01T00:00:00.000Z" },
      "Invalid Metadata: id is not a string",
    ],
    [
      "an empty id",
      { id: "", createdAt: "2026-01-01T00:00:00.000Z" },
      "Invalid Metadata: id is an empty string",
    ],
    [
      "a createdAt that is not a string",
      { id: "m-1", createdAt: 1 },
      "Invalid Metadata: createdAt is not a string",
    ],
    [
      "a createdAt that is not an ISO date time",
      { id: "m-1", createdAt: "2026-02-30T00:00:00.000Z" },
      "Invalid Metadata: createdAt is not a valid ISO date time string",
    ],
  ])("refuses %s", (_label, input, message) => {
    expect(validateMessageMetadata(input)._unsafeUnwrapErr().message).toBe(
      message,
    );
  });
});
