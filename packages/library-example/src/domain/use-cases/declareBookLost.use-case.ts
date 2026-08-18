import { err, ok, Result } from "ontologic";
import { BookState } from "../entities/book";
import { BookNotFoundError } from "../entities/book/errors/book.errors";
import { LibraryCollection } from "../repositories/libraryCollection.repository";

export async function declareBookLost(
  lostDeclaration: { bookId: string },
  dependencies: { libraryCollection: LibraryCollection },
): Promise<Result<BookState, Error>> {
  const { bookId } = lostDeclaration;
  const { libraryCollection } = dependencies;

  const bookLookup = await libraryCollection.getById(bookId);

  if (bookLookup.isErr()) {
    return err(bookLookup.error);
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

  const persistence = await libraryCollection.saveWithEvents(
    book,
    bookLostEvent,
  );

  if (persistence.isErr()) {
    return err(persistence.error);
  }

  return ok(book.readState());
}
