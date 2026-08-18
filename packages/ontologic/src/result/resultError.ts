import { Result } from ".";

export interface ErrorConfig {
  withStackTrace: boolean;
}

const defaultErrorConfig: ErrorConfig = {
  withStackTrace: true,
};

export class ResultError<T, E> extends Error {
  public data:
    | {
        type: "Ok";
        value: T;
      }
    | {
        type: "Err";
        value: E;
      };

  constructor(
    message: string,
    result: Result<T, E>,
    config: ErrorConfig = defaultErrorConfig,
  ) {
    super(message);

    this.name = "UnsafeUnwrapError";

    this.data = result.isOk()
      ? { type: "Ok", value: result.value }
      : { type: "Err", value: result.error };

    if (config.withStackTrace) {
      this.stack = new Error().stack || "No stack found";
    }

    Object.setPrototypeOf(this, ResultError.prototype);
  }
}
