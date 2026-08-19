import { Result, UseCase, err, ok } from "ontologic";

import { BookState } from "../entities/book";
import {
  BookAlreadyDeclaredLostError,
  BookNotFoundError,
} from "../entities/book/errors/book.errors";
import { LibraryCollection } from "../repositories/libraryCollection.repository";
import { DeclareBookLostCommand } from "./commands/declareBookLost.command";

/**
 * Records that a copy has gone missing, taking it out of circulation. Refused
 * if the copy is unknown, or was already declared lost.
 */
export class DeclareBookLostUseCase implements UseCase<
  DeclareBookLostCommand,
  BookState,
  BookNotFoundError | BookAlreadyDeclaredLostError
> {
  constructor(private readonly libraryCollection: LibraryCollection) {}

  async execute(
    command: DeclareBookLostCommand,
  ): Promise<
    Result<BookState, BookNotFoundError | BookAlreadyDeclaredLostError>
  > {
    const { bookId } = command.payload;

    const bookLookup = await this.libraryCollection.getById(bookId);

    if (bookLookup.isErr()) {
      throw bookLookup.error;
    }

    const book = bookLookup.value;

    if (book === undefined) {
      return err(new BookNotFoundError(bookId));
    }

    const lostOutcome = book.declareLost();

    if (lostOutcome.isErr()) {
      return err(lostOutcome.error);
    }

    const bookLostEvent = lostOutcome.value;

    const persistence = await this.libraryCollection.saveWithEvents(
      book,
      bookLostEvent,
    );

    if (persistence.isErr()) {
      throw persistence.error;
    }

    return ok(book.readState());
  }
}
