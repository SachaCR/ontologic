import { InMemoryRepository, Result, ok } from "ontologic";

import { Book, BookEvent } from "../entities/book";

export type BookSearchCriteria = {
  title?: string;
  author?: string;
};

export class LibraryCollection extends InMemoryRepository<Book, BookEvent> {
  constructor() {
    super(Book.fromState);
  }

  /**
   * Finds catalogue copies by title and/or author.
   * Matching is case-insensitive substring containment.
   * When both title and author criteria are set, a copy matches if **either** field matches (OR).
   * When every provided field is missing or only whitespace after trim, **no** copies are returned
   * (the full collection is never returned as a wildcard result).
   */
  async searchBook(
    criteria: BookSearchCriteria,
  ): Promise<Result<Book[], Error>> {
    const titleToSearch = criteria.title?.trim().toLowerCase();
    const authorToSearch = criteria.author?.trim().toLowerCase();

    const filterByTitle =
      titleToSearch !== undefined && titleToSearch.length > 0;

    const filterByAuthor =
      authorToSearch !== undefined && authorToSearch.length > 0;

    if (!filterByTitle && !filterByAuthor) {
      return ok([]);
    }

    const matches: Book[] = [];

    for (const [id, state] of this.store) {
      const titleMatches =
        filterByTitle && state.title.toLowerCase().includes(titleToSearch!);

      const authorMatches =
        filterByAuthor && state.author.toLowerCase().includes(authorToSearch!);

      if (titleMatches || authorMatches) {
        matches.push(Book.fromState(id, state));
      }
    }

    return ok(matches);
  }
}
