import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { Result } from "ontologic";

const NOT_FOUND_NAMES = new Set([
  "BOOK_NOT_FOUND",
  "LOAN_NOT_FOUND",
]);

const CONFLICT_NAMES = new Set([
  "BOOK_ALREADY_ON_LOAN",
  "BOOK_ALREADY_DECLARED_LOST",
  "LOAN_ALREADY_RETURNED",
  "BOOK_LOST_CANNOT_BE_LOANED",
  "MEMBER_ACTIVE_LOAN_LIMIT_EXCEEDED",
]);

function errorName(error: Error): string {
  if ("name" in error && typeof (error as { name: unknown }).name === "string") {
    return (error as { name: string }).name;
  }
  return "";
}

/**
 * Returns the success value or throws an HTTP exception derived from the domain error.
 */
export function unwrapResultOrThrow<T, E extends Error>(result: Result<T, E>): T {
  if (result.isOk()) {
    return result.value;
  }

  const err = result.error;
  const name = errorName(err);

  if (NOT_FOUND_NAMES.has(name)) {
    throw new NotFoundException(err.message);
  }

  if (CONFLICT_NAMES.has(name)) {
    throw new ConflictException(err.message);
  }

  if (name) {
    throw new BadRequestException(err.message);
  }

  throw new InternalServerErrorException(err.message);
}
