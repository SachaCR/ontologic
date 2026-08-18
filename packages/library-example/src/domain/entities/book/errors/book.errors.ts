import { DomainError } from "ontologic";

export class BookAlreadyDeclaredLostError extends DomainError<
  "BOOK_ALREADY_DECLARED_LOST",
  { bookId: string }
> {
  constructor(bookId: string) {
    super({
      name: "BOOK_ALREADY_DECLARED_LOST",
      message: "This book has already been declared lost",
      context: { bookId },
    });
  }
}

export class BookNotFoundError extends DomainError<
  "BOOK_NOT_FOUND",
  { bookId: string }
> {
  constructor(bookId: string) {
    super({
      name: "BOOK_NOT_FOUND",
      message: "No book exists with this identifier in the library collection",
      context: { bookId },
    });
  }
}

export class BookLostCannotBeLoanedError extends DomainError<
  "BOOK_LOST_CANNOT_BE_LOANED",
  { bookId: string }
> {
  constructor(bookId: string) {
    super({
      name: "BOOK_LOST_CANNOT_BE_LOANED",
      message: "A book that is declared lost cannot be loaned out",
      context: { bookId },
    });
  }
}

export class BookAlreadyOnLoanError extends DomainError<
  "BOOK_ALREADY_ON_LOAN",
  { bookId: string }
> {
  constructor(bookId: string) {
    super({
      name: "BOOK_ALREADY_ON_LOAN",
      message: "This copy is already on loan; return it before lending it again",
      context: { bookId },
    });
  }
}
