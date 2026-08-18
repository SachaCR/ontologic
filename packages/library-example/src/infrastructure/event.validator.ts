import { z } from "zod";
import { switchGuard } from "ontologic";

import { BookCreatedEvent, BookLostEvent } from "../domain/entities/book";
import { LoanCreatedEvent, LoanReturnedEvent } from "../domain/entities/loan";

export function validateDomainEvent(event: unknown) {
  const namedObjectSchema = z.looseObject({
    name: z.enum([
      "BOOK_LOST",
      "BOOK_CREATED",
      "LOAN_CREATED",
      "LOAN_RETURNED",
    ]),
  });

  const namedObject = namedObjectSchema.parse(event);

  switch (namedObject.name) {
    case "BOOK_CREATED":
      return BookCreatedEvent.validate(namedObject);

    case "BOOK_LOST":
      return BookLostEvent.validate(namedObject);

    case "LOAN_CREATED":
      return LoanCreatedEvent.validate(namedObject);

    case "LOAN_RETURNED":
      return LoanReturnedEvent.validate(namedObject);

    default:
      switchGuard(namedObject.name);
  }
}
