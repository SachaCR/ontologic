import { Result, UseCase, ok } from "ontologic";

import { BookState } from "../entities/book";
import { LibraryCollection } from "../repositories/libraryCollection.repository";
import { SearchBooksQuery } from "./queries/searchBooks.query";

/**
 * Finds copies in the collection by title or author. Declared over a `Query`,
 * so the tooling can tell it writes nothing without reading the body.
 */
export class SearchBooksUseCase implements UseCase<
  SearchBooksQuery,
  BookState[],
  never
> {
  constructor(private readonly libraryCollection: LibraryCollection) {}

  async execute(query: SearchBooksQuery): Promise<Result<BookState[], never>> {
    const searchOutcome = await this.libraryCollection.searchBook(
      query.payload,
    );

    if (searchOutcome.isErr()) {
      throw searchOutcome.error;
    }

    return ok(searchOutcome.value.map((book) => book.readState()));
  }
}
