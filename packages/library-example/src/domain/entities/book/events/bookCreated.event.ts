import { z } from "zod";
import { DomainEvent } from "ontologic";

export interface BookCreatedPayload {
  title: string;
  author: string;
  isbn: string;
  category: string;
  tags: string[];
  lost: boolean;
}

export class BookCreatedEvent extends DomainEvent<
  "BOOK_CREATED",
  1,
  BookCreatedPayload
> {
  constructor(entityId: string, payload: BookCreatedPayload) {
    super({ name: "BOOK_CREATED", version: 1, entityId, payload });
  }

  static validate(event: unknown): BookCreatedEvent {
    const schema = z.object({
      name: z.literal("BOOK_CREATED"),
      version: z.literal(1),
      entityId: z.string(),
      payload: z.object({
        title: z.string(),
        author: z.string(),
        isbn: z.string(),
        category: z.string(),
        tags: z.array(z.string()),
        lost: z.boolean(),
      }),
    });

    const result = schema.parse(event);

    return new BookCreatedEvent(result.entityId, result.payload);
  }
}
