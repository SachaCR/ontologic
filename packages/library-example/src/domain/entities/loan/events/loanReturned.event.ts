import { z } from "zod";
import { DomainEvent } from "ontologic";

export interface LoanReturnedPayload {
  bookId: string;
  memberId: string;
  returnedAt: string;
}

export class LoanReturnedEvent extends DomainEvent<
  "LOAN_RETURNED",
  1,
  LoanReturnedPayload
> {
  constructor(entityId: string, payload: LoanReturnedPayload) {
    super({ name: "LOAN_RETURNED", version: 1, entityId, payload });
  }

  static validate(event: unknown): LoanReturnedEvent {
    const schema = z.object({
      name: z.literal("LOAN_RETURNED"),
      version: z.literal(1),
      entityId: z.string(),
      payload: z.object({
        bookId: z.string(),
        memberId: z.string(),
        returnedAt: z.string(),
      }),
    });

    const result = schema.parse(event);

    return new LoanReturnedEvent(result.entityId, result.payload);
  }
}
