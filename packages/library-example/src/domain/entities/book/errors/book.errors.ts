import { DomainError } from "ontologic";

/** The copy has already been declared lost, so there is nothing new to record. */
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

    Object.setPrototypeOf(this, BookAlreadyDeclaredLostError.prototype);
  }
}

/** The library has no copy with this id. */
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

    Object.setPrototypeOf(this, BookNotFoundError.prototype);
  }
}

/** A copy declared lost cannot be lent — it is not on the shelf to lend. */
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

    Object.setPrototypeOf(this, BookLostCannotBeLoanedError.prototype);
  }
}

/** The copy is already out with another member. One physical copy, one open loan. */
export class BookAlreadyOnLoanError extends DomainError<
  "BOOK_ALREADY_ON_LOAN",
  { bookId: string }
> {
  constructor(bookId: string) {
    super({
      name: "BOOK_ALREADY_ON_LOAN",
      message:
        "This copy is already on loan; return it before lending it again",
      context: { bookId },
    });

    Object.setPrototypeOf(this, BookAlreadyOnLoanError.prototype);
  }
}
