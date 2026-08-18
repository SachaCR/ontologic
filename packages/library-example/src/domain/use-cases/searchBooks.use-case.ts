import { err, ok, Result } from "ontologic";
import { BookState } from "../entities/book";
import {
  BookSearchCriteria,
  LibraryCollection,
} from "../repositories/libraryCollection.repository";

export async function searchBooks(
  catalogueQuery: BookSearchCriteria,
  dependencies: { libraryCollection: LibraryCollection },
): Promise<Result<BookState[], Error>> {
  const { libraryCollection } = dependencies;

  const searchOutcome = await libraryCollection.searchBook(catalogueQuery);

  if (searchOutcome.isErr()) {
    return err(searchOutcome.error);
  }

  return ok(searchOutcome.value.map((book) => book.readState()));
}
