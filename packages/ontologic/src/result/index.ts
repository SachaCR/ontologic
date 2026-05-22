import { ErrorConfig, ResultError } from "./resultError";

export function ok<T, E = never>(value: T): Ok<T, E>;
export function ok<T extends void = void, E = never>(value: void): Ok<void, E>;
export function ok<T, E = never>(value: T): Ok<T, E> {
  return new Ok(value);
}

export function err<T = never, E extends string = string>(err: E): Err<T, E>;
export function err<T = never, E = unknown>(err: E): Err<T, E>;
export function err<T = never, E extends void = void>(err: void): Err<T, void>;
export function err<T = never, E = unknown>(err: E): Err<T, E> {
  return new Err(err);
}

export type Result<T, E> = Ok<T, E> | Err<T, E>;

export interface IResult<T, E> {
  /**
   * Used to check if a `Result` is an `OK`
   *
   * @returns `true` if the result is an `OK` variant of Result
   */
  isOk(): this is Ok<T, E>;

  /**
   * Used to check if a `Result` is an `Err`
   *
   * @returns `true` if the result is an `Err` variant of Result
   */
  isErr(): this is Err<T, E>;

  /**
   * **This method is unsafe, and should only be used in a test environments**
   *
   * Takes a `Result<T, E>` and returns a `T` when the result is an `Ok`, otherwise it throws a custom object.
   *
   * @param config
   */
  _unsafeUnwrap(config?: ErrorConfig): T;

  /**
   * **This method is unsafe, and should only be used in a test environments**
   *
   * takes a `Result<T, E>` and returns a `E` when the result is an `Err`,
   * otherwise it throws a custom object.
   *
   * @param config
   */
  _unsafeUnwrapErr(config?: ErrorConfig): E;
}

export class Ok<T, E> implements IResult<T, E> {
  constructor(readonly value: T) {}

  isOk(): this is Ok<T, E> {
    return true;
  }

  isErr(): this is Err<T, E> {
    return !this.isOk();
  }

  _unsafeUnwrap(_?: ErrorConfig): T {
    return this.value;
  }

  _unsafeUnwrapErr(config?: ErrorConfig): E {
    throw new ResultError("Called `_unsafeUnwrapErr` on an Ok", this, config);
  }
}

export class Err<T, E> implements IResult<T, E> {
  constructor(readonly error: E) {}

  isOk(): this is Ok<T, E> {
    return false;
  }

  isErr(): this is Err<T, E> {
    return !this.isOk();
  }

  _unsafeUnwrap(config?: ErrorConfig): T {
    throw new ResultError("Called `_unsafeUnwrap` on an Err", this, config);
  }

  _unsafeUnwrapErr(_?: ErrorConfig): E {
    return this.error;
  }
}
