import { err, ok, type Result } from "../result";
import { type MessageMetadata } from "./interfaces";

/**
 * Checks shared by the wire schemas of both buses. Internal: not exported from
 * the package.
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** `null` when `record[key]` is a non-empty string, the reason otherwise. */
export function nonEmptyString(
  record: Record<string, unknown>,
  key: string,
  shape: string,
): Error | null {
  const value = record[key];

  if (typeof value !== "string") {
    return new Error(`Invalid ${shape}: ${key} is not a string`);
  }

  if (value.length === 0) {
    return new Error(`Invalid ${shape}: ${key} is an empty string`);
  }

  return null;
}

/**
 * Validates the `MessageMetadata` part of any metadata: a non-empty `id` and an
 * exact ISO `createdAt`. Extra fields are left alone and returned as they are.
 */
export function validateMessageMetadata(
  input: unknown,
): Result<MessageMetadata, Error> {
  if (!isRecord(input)) {
    return err(new Error("Invalid Metadata"));
  }

  const idError = nonEmptyString(input, "id", "Metadata");

  if (idError) {
    return err(idError);
  }

  if (typeof input["createdAt"] !== "string") {
    return err(new Error("Invalid Metadata: createdAt is not a string"));
  }

  if (!isExactISODateTime(input["createdAt"])) {
    return err(
      new Error(
        "Invalid Metadata: createdAt is not a valid ISO date time string",
      ),
    );
  }

  return ok(input as unknown as MessageMetadata);
}

/**
 * An ISO 8601 date time with a timezone (`Z` or `±HH:MM`) that names a real
 * instant: no February 30th, no hour 24, no offset beyond ±23:59.
 *
 * The written fields are checked as written, in their own timezone, so
 * `08:30:45+05:30` is accepted. Comparing them to the UTC fields would reject
 * every non-zero offset.
 */
function isExactISODateTime(value: string): boolean {
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d+)?(Z|([+-])(\d{2}):(\d{2}))$/,
  );
  if (!match) return false;

  const [, y, m, d, h, min, s, , zone, sign, offsetH, offsetMin] = match;

  const date = new Date(value);
  if (isNaN(date.getTime())) return false;

  if (zone !== "Z" && (Number(offsetH) > 23 || Number(offsetMin) > 59)) {
    return false;
  }

  // The written fields, read as if they were UTC. If any of them overflowed
  // (day 30 in February, hour 24...), reading them back gives other values.
  const asWritten = new Date(
    Date.UTC(
      Number(y),
      Number(m) - 1,
      Number(d),
      Number(h),
      Number(min),
      Number(s),
    ),
  );

  const fieldsAreReal =
    asWritten.getUTCFullYear() === Number(y) &&
    asWritten.getUTCMonth() + 1 === Number(m) &&
    asWritten.getUTCDate() === Number(d) &&
    asWritten.getUTCHours() === Number(h) &&
    asWritten.getUTCMinutes() === Number(min) &&
    asWritten.getUTCSeconds() === Number(s);

  if (!fieldsAreReal) return false;

  // And the instant they name, once the offset is applied, must be the one
  // `Date` parsed. Fractional seconds are left out of the comparison.
  const offsetMs =
    zone === "Z"
      ? 0
      : (sign === "-" ? -1 : 1) *
        (Number(offsetH) * 60 + Number(offsetMin)) *
        60_000;

  return (
    Math.floor(date.getTime() / 1000) * 1000 === asWritten.getTime() - offsetMs
  );
}
