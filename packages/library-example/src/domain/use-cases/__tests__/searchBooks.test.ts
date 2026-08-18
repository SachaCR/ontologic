import { beforeEach, describe, expect, it } from "vitest";
import { SearchBooksUseCase } from "../searchBooks.use-case";
import { SearchBooksQuery } from "../queries/searchBooks.query";
import { LibraryCollection } from "../../repositories/libraryCollection.repository";
import { addCopyToCatalog } from "./helpers";

describe("Given the catalog lists several copies with different titles", () => {
  let collection: LibraryCollection;
  let searchBooks: SearchBooksUseCase;

  beforeEach(async () => {
    collection = new LibraryCollection();
    searchBooks = new SearchBooksUseCase(collection);
    await addCopyToCatalog(collection, {
      title: "Alpha Guide",
      author: "Alex A.",
      isbn: "978-aaaaaaaaaa",
    });
    await addCopyToCatalog(collection, {
      title: "Beta Handbook",
      author: "Bob B.",
      isbn: "978-bbbbbbbbbb",
    });
  });

  describe("When I search the catalog by title through the use case", () => {
    let outcome: Awaited<ReturnType<SearchBooksUseCase["execute"]>>;

    beforeEach(async () => {
      outcome = await searchBooks.execute(
        new SearchBooksQuery({ title: "alpha" }),
      );
    });

    it("Then I get back catalog states for matching copies only", () => {
      expect(outcome.isOk()).toBe(true);
      if (outcome.isOk()) {
        expect(outcome.value).toHaveLength(1);
        expect(outcome.value[0]!.title).toBe("Alpha Guide");
      }
    });
  });
});

describe("Given the catalog has at least one copy", () => {
  let collection: LibraryCollection;
  let searchBooks: SearchBooksUseCase;

  beforeEach(async () => {
    collection = new LibraryCollection();
    searchBooks = new SearchBooksUseCase(collection);
    await addCopyToCatalog(collection, { isbn: "978-cccccccccc" });
  });

  describe("When I run a search with no real title or author text", () => {
    let outcome: Awaited<ReturnType<SearchBooksUseCase["execute"]>>;

    beforeEach(async () => {
      outcome = await searchBooks.execute(new SearchBooksQuery({}));
    });

    it("Then I get an empty result list from the use case", () => {
      expect(outcome.isOk()).toBe(true);
      if (outcome.isOk()) {
        expect(outcome.value).toHaveLength(0);
      }
    });
  });
});
