import { DomainEvent } from "ontologic";
import { z } from "zod";

export interface BookLostPayload {
  bookId: string;
}

export class BookLostEvent extends DomainEvent<
  "BOOK_LOST",
  1,
  BookLostPayload
> {
  constructor(entityId: string) {
    super({
      name: "BOOK_LOST",
      version: 1,
      entityId,
      payload: {
        bookId: entityId,
      },
    });
  }

  static validate(event: unknown): BookLostEvent {
    const schema = z.object({
      name: z.literal("BOOK_LOST"),
      version: z.literal(1),
      entityId: z.string(),
      payload: z.object({
        bookId: z.string(),
      }),
    });

    const result = schema.parse(event);

    return new BookLostEvent(result.payload.bookId);
  }
}
