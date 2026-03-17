export class DomainError<Name extends string, Context> extends Error {
  public context?: Context;
  public cause?: unknown;

  constructor(params: {
    message: string;
    name: Name;
    context?: Context;
    cause?: unknown;
  }) {
    const { message, name, context, cause } = params;

    super(message);

    this.name = name;
    this.context = context;
    this.cause = cause;

    Object.setPrototypeOf(this, DomainError.prototype);
  }
}

