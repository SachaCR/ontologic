import { beforeEach, describe, expect, it } from "vitest";
import { Book } from "../../entities/book";
import { LibraryCollection } from "../libraryCollection.repository";

async function addCopyToCollection(
  collection: LibraryCollection,
  catalogueFields: {
    title: string;
    author: string;
    isbn: string;
    category: string;
    tags: string[];
  },
) {
  const { book, event } = Book.create(catalogueFields);
  const saved = await collection.saveWithEvents(book, event);
  expect(saved.isOk()).toBe(true);
}

describe("Given the library catalogue has no copies on file yet", () => {
  let collection: LibraryCollection;

  beforeEach(() => {
    collection = new LibraryCollection();
  });

  describe("When I search for copies by title", () => {
    let outcome: Awaited<ReturnType<LibraryCollection["searchBook"]>>;

    beforeEach(async () => {
      outcome = await collection.searchBook({ title: "anything" });
    });

    it("Then the search succeeds and finds no catalogue copies", () => {
      expect(outcome.isOk()).toBe(true);
      if (outcome.isOk()) {
        expect(outcome.value).toHaveLength(0);
      }
    });
  });
});

describe("Given the library holds several catalogue copies with different titles and authors", () => {
  let collection: LibraryCollection;

  beforeEach(async () => {
    collection = new LibraryCollection();
    await addCopyToCollection(collection, {
      title: "Domain-Driven Design",
      author: "Eric Evans",
      isbn: "978-0321125217",
      category: "software",
      tags: ["ddd"],
    });
    await addCopyToCollection(collection, {
      title: "Implementing Domain-Driven Design",
      author: "Vaughn Vernon",
      isbn: "978-0134434421",
      category: "software",
      tags: ["ddd"],
    });
    await addCopyToCollection(collection, {
      title: "1984",
      author: "George Orwell",
      isbn: "978-0451524935",
      category: "fiction",
      tags: ["classic"],
    });
  });

  describe("When I search for copies whose title contains a phrase, ignoring letter case", () => {
    let outcome: Awaited<ReturnType<LibraryCollection["searchBook"]>>;

    beforeEach(async () => {
      outcome = await collection.searchBook({ title: "DOMAIN" });
    });

    it("Then I get the two DDD-related titles and not the novel", () => {
      expect(outcome.isOk()).toBe(true);
      if (outcome.isOk()) {
        const titles = outcome.value.map((b) => b.readState().title).sort();
        expect(titles).toEqual([
          "Domain-Driven Design",
          "Implementing Domain-Driven Design",
        ]);
      }
    });
  });

  describe("When I search for copies by a fragment of the author name", () => {
    let outcome: Awaited<ReturnType<LibraryCollection["searchBook"]>>;

    beforeEach(async () => {
      outcome = await collection.searchBook({ author: "orwell" });
    });

    it("Then only George Orwell's copy is returned", () => {
      expect(outcome.isOk()).toBe(true);
      if (outcome.isOk()) {
        expect(outcome.value).toHaveLength(1);
        expect(outcome.value[0]!.readState().title).toBe("1984");
      }
    });
  });

  describe("When I search using both title and author at once", () => {
    let outcome: Awaited<ReturnType<LibraryCollection["searchBook"]>>;

    beforeEach(async () => {
      outcome = await collection.searchBook({
        title: "Design",
        author: "Orwell",
      });
    });

    it("Then I get every copy that matches the title or the author, each at most once", () => {
      expect(outcome.isOk()).toBe(true);
      if (outcome.isOk()) {
        const titles = outcome.value.map((b) => b.readState().title).sort();
        expect(titles).toEqual([
          "1984",
          "Domain-Driven Design",
          "Implementing Domain-Driven Design",
        ]);
      }
    });
  });

  describe("When I search with a title that matches one book and an author that matches another", () => {
    let outcome: Awaited<ReturnType<LibraryCollection["searchBook"]>>;

    beforeEach(async () => {
      outcome = await collection.searchBook({
        title: "1984",
        author: "Evans",
      });
    });

    it("Then I get every copy that matches either the title or the author", () => {
      expect(outcome.isOk()).toBe(true);
      if (outcome.isOk()) {
        const titles = outcome.value.map((b) => b.readState().title).sort();
        expect(titles).toEqual(["1984", "Domain-Driven Design"]);
      }
    });
  });

  describe("When I search without giving title or author (or only blank spaces)", () => {
    let outcome: Awaited<ReturnType<LibraryCollection["searchBook"]>>;

    beforeEach(async () => {
      outcome = await collection.searchBook({
        title: "   ",
        author: "\t",
      });
    });

    it("Then no catalogue copies are returned because there is nothing to search for", () => {
      expect(outcome.isOk()).toBe(true);
      if (outcome.isOk()) {
        expect(outcome.value).toHaveLength(0);
      }
    });
  });
});

describe("Given the catalogue already lists at least one copy", () => {
  let collection: LibraryCollection;

  beforeEach(async () => {
    collection = new LibraryCollection();
    await addCopyToCollection(collection, {
      title: "Clean Architecture",
      author: "Robert C. Martin",
      isbn: "978-0134494166",
      category: "software",
      tags: ["architecture"],
    });
  });

  describe("When I run a catalogue search with an empty criteria object", () => {
    let outcome: Awaited<ReturnType<LibraryCollection["searchBook"]>>;

    beforeEach(async () => {
      outcome = await collection.searchBook({});
    });

    it("Then I get no matches instead of the entire collection", () => {
      expect(outcome.isOk()).toBe(true);
      if (outcome.isOk()) {
        expect(outcome.value).toHaveLength(0);
      }
    });
  });
});
