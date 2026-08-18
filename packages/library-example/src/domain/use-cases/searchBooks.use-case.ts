import { Result, UseCase, ok } from "ontologic";

import { BookState } from "../entities/book";
import { LibraryCollection } from "../repositories/libraryCollection.repository";
import { SearchBooksQuery } from "./queries/searchBooks.query";

/**
 * A read. It is declared over a `Query`, so nothing about it needs to be
 * inferred from the body — the action itself says this writes nothing.
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
