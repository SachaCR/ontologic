/**
 * @description Custom error classes for our application.
 * - "DOMAIN_ERROR": Use when Expected error cases happens in your business logic / domain.
 * - "TECHNICAL_ERROR":  Use when it throws because for technical reasons.
 * - "UNEXPECTED_ERROR":  Use when something breaks unexpectedly.
 */
export type CustomErrorNames =
  | "DOMAIN_ERROR"
  | "TECHNICAL_ERROR"
  | "UNEXPECTED_ERROR";

/**
 * @description A class that represent our custom errors.
 * @typeParam Code - Type that will define the error code enum.
 * @typeParam Context - Type that will define the context of the error.
 * @property name - Error name
 * - "DOMAIN_ERROR": Use when Expected error cases happens in your business logic / domain.
 * - "TECHNICAL_ERROR":  Use when it trows because for technical reasons.
 * - "UNEXPECTED_ERROR":  Use when something breaks unexpectedly.
 * @property code - Error code that will be used to identify the error. Define by the Code type.
 * @property context - Additional context that can be used to provide more information about the error.
 */
export class CustomError<Code extends string, Context> extends Error {
  /**
   * Custom error code matching type Code
   */
  public code: Code;
  public context?: Context;
  public cause?: unknown;

  constructor(params: {
    message: string;
    name: CustomErrorNames;
    errorCode: Code;
    context?: Context;
    cause?: unknown;
  }) {
    const { errorCode, message, name, context, cause } = params;

    super(message);

    this.name = name;
    this.code = errorCode;
    this.context = context;
    this.cause = cause;

    Object.setPrototypeOf(this, CustomError.prototype);
  }

  /**
   * @description Converts the error to a JSON-serializable object.
   * @returns A JSON-serializable object representing the error.
   */
  toJSON() {
    return {
      message: this.message,
      name: this.name,
      code: this.code,
      context: this.context ?? null,
      stack: this.stack ?? null,
    };
  }

  /*
   * @description Convert the error to a string.
   * @returns String representation of the error.
   */
  toString() {
    return `[${this.name} ${this.code}] ${this.message}`;
  }
}

export interface CustomErrorJSON {
  name: string;
  code: string;
  message: string;
  context: unknown;
  stack: string | null;
}
