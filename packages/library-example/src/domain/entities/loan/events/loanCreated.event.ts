import { DomainEvent } from "ontologic";
import { z } from "zod";

export interface LoanCreatedPayload {
  bookId: string;
  memberId: string;
  loanDate: string;
  dueDate: string;
}

export class LoanCreatedEvent extends DomainEvent<
  "LOAN_CREATED",
  1,
  LoanCreatedPayload
> {
  constructor(entityId: string, payload: LoanCreatedPayload) {
    super({ name: "LOAN_CREATED", version: 1, entityId, payload });
  }

  static validate(event: unknown): LoanCreatedEvent {
    const schema = z.object({
      name: z.literal("LOAN_CREATED"),
      version: z.literal(1),
      entityId: z.string(),
      payload: z.object({
        bookId: z.string(),
        memberId: z.string(),
        loanDate: z.string(),
        dueDate: z.string(),
      }),
    });

    const result = schema.parse(event);

    return new LoanCreatedEvent(result.entityId, result.payload);
  }
}
