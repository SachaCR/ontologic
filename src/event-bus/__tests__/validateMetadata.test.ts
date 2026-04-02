import { describe, it, expect } from "vitest";

import type { EventMetadata } from "../../repository";
import { validateMetadata } from "../validateMetadata";

const validCreatedAt = "2026-03-30T12:00:00.000Z";

function base(overrides?: Partial<EventMetadata>): EventMetadata {
  return {
    id: "evt-1",
    createdAt: validCreatedAt,
    ...overrides,
  };
}

describe("validateMetadata", () => {
  it("returns the same object when validation succeeds", () => {
    const metadata = base();
    expect(validateMetadata(metadata)).toBe(metadata);
  });

  it("accepts metadata with offset omitted", () => {
    expect(() =>
      validateMetadata({ id: "a", createdAt: validCreatedAt }),
    ).not.toThrow();
  });

  it("accepts offset 0", () => {
    expect(validateMetadata(base({ offset: 0 })).offset).toBe(0);
  });

  it("accepts a positive integer offset", () => {
    expect(validateMetadata(base({ offset: 42 })).offset).toBe(42);
  });

  it.each([
    ["Z", "2026-01-15T08:30:45Z"],
    ["fractional seconds", "2026-01-15T08:30:45.123Z"],
    ["UTC +00:00", "2026-01-15T08:30:45+00:00"],
    ["UTC -00:00", "2026-01-15T08:30:45-00:00"],
  ] as const)("accepts createdAt with %s", (_label, createdAt) => {
    expect(validateMetadata(base({ createdAt })).createdAt).toBe(createdAt);
  });

  it("rejects createdAt with a non-zero UTC offset (isExactISODateTime compares literal H:M:S to UTC parts)", () => {
    expect(() =>
      validateMetadata({ id: "x", createdAt: "2026-01-15T08:30:45+05:30" }),
    ).toThrow(
      "Invalid Metadata: createdAt is not a valid ISO date time string",
    );
  });

  it("preserves unknown extra enumerable keys on the object", () => {
    const metadata = { ...base(), traceId: "t-1" } as EventMetadata & {
      traceId: string;
    };
    const out = validateMetadata(metadata);
    expect((out as typeof metadata).traceId).toBe("t-1");
  });

  it("throws for null", () => {
    expect(() => validateMetadata(null)).toThrow(
      "Null or undefined event metadata",
    );
  });

  it("throws for undefined", () => {
    expect(() => validateMetadata(undefined)).toThrow(
      "Null or undefined event metadata",
    );
  });

  it.each([
    ["number 0", 0],
    ["false", false],
    ["empty string", ""],
  ] as const)(
    "treats %s as missing metadata (falsy check)",
    (_label, value) => {
      expect(() => validateMetadata(value)).toThrow(
        "Null or undefined event metadata",
      );
    },
  );

  it.each([
    ["string", "not-an-object"],
    ["number", 42],
    ["bigint", BigInt(1)],
    ["symbol", Symbol("x")],
  ] as const)(
    "throws when metadata is not a plain object (%s)",
    (_label, value) => {
      expect(() => validateMetadata(value)).toThrow("Invalid Metadata");
    },
  );

  it("throws when id is missing", () => {
    expect(() =>
      validateMetadata({ createdAt: validCreatedAt } as unknown),
    ).toThrow("Invalid Metadata: id is not a string");
  });

  it("throws when id is not a string", () => {
    expect(() =>
      validateMetadata({ id: 1, createdAt: validCreatedAt } as unknown),
    ).toThrow("Invalid Metadata: id is not a string");
  });

  it("throws when id is an empty string", () => {
    expect(() =>
      validateMetadata({ id: "", createdAt: validCreatedAt }),
    ).toThrow("Invalid Metadata: id is an empty string");
  });

  it("throws when createdAt is missing", () => {
    expect(() => validateMetadata({ id: "x" } as unknown)).toThrow(
      "Invalid Metadata: createdAt is not a string",
    );
  });

  it("throws when createdAt is not a string", () => {
    expect(() =>
      validateMetadata({ id: "x", createdAt: 1_700_000_000_000 } as unknown),
    ).toThrow("Invalid Metadata: createdAt is not a string");
  });

  it("throws when createdAt is not a valid ISO date time (shape)", () => {
    expect(() =>
      validateMetadata({ id: "x", createdAt: "2026-01-01" }),
    ).toThrow(
      "Invalid Metadata: createdAt is not a valid ISO date time string",
    );
  });

  it("throws when createdAt is not a valid ISO date time (garbage)", () => {
    expect(() =>
      validateMetadata({ id: "x", createdAt: "not-a-date" }),
    ).toThrow(
      "Invalid Metadata: createdAt is not a valid ISO date time string",
    );
  });

  it("throws when the calendar does not match the UTC instant (invalid day/month)", () => {
    expect(() =>
      validateMetadata({ id: "x", createdAt: "2026-02-31T00:00:00.000Z" }),
    ).toThrow(
      "Invalid Metadata: createdAt is not a valid ISO date time string",
    );
  });

  it("throws when offset is null", () => {
    expect(() =>
      validateMetadata({
        id: "x",
        createdAt: validCreatedAt,
        offset: null,
      } as unknown),
    ).toThrow("Invalid Metadata: offset is neither a number or undefined");
  });

  it("throws when offset is a string", () => {
    expect(() =>
      validateMetadata({
        id: "x",
        createdAt: validCreatedAt,
        offset: "0",
      } as unknown),
    ).toThrow("Invalid Metadata: offset is neither a number or undefined");
  });

  it("throws when offset is NaN", () => {
    expect(() =>
      validateMetadata({ id: "x", createdAt: validCreatedAt, offset: NaN }),
    ).toThrow("Invalid Metadata: offset must be a finite number");
  });

  it("throws when offset is Infinity", () => {
    expect(() =>
      validateMetadata({
        id: "x",
        createdAt: validCreatedAt,
        offset: Number.POSITIVE_INFINITY,
      }),
    ).toThrow("Invalid Metadata: offset must be a finite number");
  });
});
