import { Result, UseCase, ok } from "ontologic";

import { Book, BookState } from "../entities/book";
import { LibraryCollection } from "../repositories/libraryCollection.repository";
import { AddBookCommand } from "./commands/addBook.command";

/**
 * Adds a copy to the library's collection. Nothing can refuse it, so this use
 * case has no domain errors at all.
 */
export class AddBookUseCase implements UseCase<
  AddBookCommand,
  BookState,
  never
> {
  constructor(private readonly libraryCollection: LibraryCollection) {}

  async execute(command: AddBookCommand): Promise<Result<BookState, never>> {
    const { book, event } = Book.create(command.payload);

    const saveResult = await this.libraryCollection.saveWithEvents(book, event);

    if (saveResult.isErr()) {
      throw saveResult.error;
    }

    return ok(book.readState());
  }
}
