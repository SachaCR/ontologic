import { Result, UseCase, ok } from "ontologic";

import { Book, BookState } from "../entities/book";
import { LibraryCollection } from "../repositories/libraryCollection.repository";
import { AddBookCommand } from "./commands/addBook.command";

/**
 * Adding a book has no domain failure mode, so the error side is `never`. A
 * failure to persist is technical, and technical failures are thrown.
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
