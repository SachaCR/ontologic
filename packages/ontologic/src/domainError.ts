export class DomainError<Name extends string, Context> extends Error {
  public context: Context | undefined;

  declare public name: Name;

  constructor(params: {
    message: string;
    name: Name;
    context?: Context;
    cause?: unknown;
  }) {
    const { message, name, context, cause } = params;

    super(message, {
      cause,
    });

    this.name = name;
    this.context = context;

    Object.setPrototypeOf(this, DomainError.prototype);
  }
}
