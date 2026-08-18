import { Book } from "../../entities/book";
import { LibraryCollection } from "../../repositories/libraryCollection.repository";

export const sampleCatalogueEntry = {
  title: "Test Title",
  author: "Test Author",
  isbn: "978-0000000000",
  category: "fiction",
  tags: ["test"],
};

export async function addCopyToCatalog(
  collection: LibraryCollection,
  overrides: Partial<{
    title: string;
    author: string;
    isbn: string;
    category: string;
    tags: string[];
  }> = {},
): Promise<string> {
  const fields = { ...sampleCatalogueEntry, ...overrides };
  const { book, event } = Book.create(fields);
  const saved = await collection.saveWithEvents(book, event);
  if (saved.isErr()) {
    throw saved.error;
  }
  return book.id();
}
