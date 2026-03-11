export type CustomErrorNames =
  | "DOMAIN_ERROR"
  | "TECHNICAL_ERROR"
  | "UNEXPECTED_ERROR";

export class CustomError<Code extends string, Context> extends Error {
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

  toJSON() {
    return {
      message: this.message,
      name: this.name,
      code: this.code,
      context: this.context ?? null,
      stack: this.stack ?? null,
    };
  }

  toString() {
    return `[${this.name} ${this.code}] ${this.message}`;
  }
}
