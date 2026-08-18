import { describe, it, expect, beforeEach } from "vitest";
import { Book, type BookState } from "../book.entity";

const catalogueDetailsForNewBook = {
  title: "Domain-Driven Design",
  author: "Eric Evans",
  isbn: "978-0321125217",
  category: "software",
  tags: ["ddd", "architecture"],
} satisfies Omit<BookState, "lost">;

describe("Given I have a new book to add to the library collection", () => {
  describe("When I register the book", () => {
    const { book, event } = Book.create(catalogueDetailsForNewBook);

    it("Then its state matches the provided information", () => {
      expect(book.readState()).toMatchObject({
        ...catalogueDetailsForNewBook,
        lost: false,
      });
    });

    it("Then the book is not lost", () => {
      expect(book.readState().lost).toBe(false);
    });

    it("Then a book-created event records the same catalogue details and shows the book as not lost", () => {
      expect(event.name).toBe("BOOK_CREATED");
      expect(event.version).toBe(1);
      expect(event.payload).toEqual({
        ...catalogueDetailsForNewBook,
        lost: false,
      });
    });

    it("Then the event identifies the same book as the aggregate", () => {
      expect(event.entityId).toBe(book.id());
    });
  });
});

describe(
  "Given I have a book in the collection that is still available (not lost)",
  () => {
    let book: Book;

    beforeEach(() => {
      book = Book.create(catalogueDetailsForNewBook).book;
    });

    describe("When I declare that book lost", () => {
      let outcome: ReturnType<Book["declareLost"]>;

      beforeEach(() => {
        outcome = book.declareLost();
      });

      it("Then I get a successful outcome with a book-lost event for that copy", () => {
        expect(outcome.isOk()).toBe(true);
        if (outcome.isOk()) {
          expect(outcome.value.name).toBe("BOOK_LOST");
          expect(outcome.value.entityId).toBe(book.id());
          expect(outcome.value.payload).toEqual({ bookId: book.id() });
        }
      });

      it("Then the book is marked as lost", () => {
        expect(book.readState().lost).toBe(true);
      });
    });
  },
);

describe("Given I have already declared a book lost", () => {
  let book: Book;

  beforeEach(() => {
    book = Book.create(catalogueDetailsForNewBook).book;
    book.declareLost();
  });

  describe("When I try to declare the same book lost again", () => {
    let outcome: ReturnType<Book["declareLost"]>;

    beforeEach(() => {
      outcome = book.declareLost();
    });

    it("Then the library refuses because the book was already declared lost", () => {
      expect(outcome.isErr()).toBe(true);
      if (outcome.isErr()) {
        expect(outcome.error.name).toBe("BOOK_ALREADY_DECLARED_LOST");
        expect(outcome.error.context).toEqual({ bookId: book.id() });
      }
    });

    it("Then the book stays lost", () => {
      expect(book.readState().lost).toBe(true);
    });
  });
});

describe("Given the library has a saved record of a book (id and catalogue snapshot)", () => {
  const savedBookId = "11111111-1111-1111-1111-111111111111";
  const savedSnapshot: BookState = {
    ...catalogueDetailsForNewBook,
    lost: false,
  };

  describe("When I load the book back from that saved snapshot", () => {
    const book = Book.fromState(savedBookId, savedSnapshot);

    it("Then the book has the same identifier and catalogue information as when it was saved", () => {
      expect(book.id()).toBe(savedBookId);
      expect(book.readState()).toEqual(savedSnapshot);
    });
  });
});
