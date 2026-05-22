import { err, ok, Result } from "ontologic";
import { Book, BookState } from "../entities/book";
import { LibraryCollection } from "../repositories/libraryCollection.repository";

export async function addBook(
  bookData: {
    title: string;
    author: string;
    isbn: string;
    category: string;
    tags: string[];
  },
  dependencies: { libraryCollection: LibraryCollection },
): Promise<Result<BookState, Error>> {
  const { libraryCollection } = dependencies;

  const result = Book.create(bookData);
  const { book, event } = result;

  const saveResult = await libraryCollection.saveWithEvents(book, event);

  if (saveResult.isErr()) {
    return err(saveResult.error);
  }

  return ok(book.readState());
}
