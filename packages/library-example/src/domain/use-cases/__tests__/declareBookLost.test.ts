import { beforeEach, describe, expect, it } from "vitest";
import { DeclareBookLostUseCase } from "../declareBookLost.use-case";
import { DeclareBookLostCommand } from "../commands/declareBookLost.command";
import { LibraryCollection } from "../../repositories/libraryCollection.repository";
import { addCopyToCatalog } from "./helpers";

describe("Given a copy is already listed in the catalog and still on shelf", () => {
  let collection: LibraryCollection;
  let declareBookLost: DeclareBookLostUseCase;
  let bookId: string;

  beforeEach(async () => {
    collection = new LibraryCollection();
    declareBookLost = new DeclareBookLostUseCase(collection);
    bookId = await addCopyToCatalog(collection, { isbn: "978-2222222222" });
  });

  describe("When I declare that copy lost through the use case", () => {
    let outcome: Awaited<ReturnType<DeclareBookLostUseCase["execute"]>>;

    beforeEach(async () => {
      outcome = await declareBookLost.execute(
        new DeclareBookLostCommand({ bookId }),
      );
    });

    it("Then the outcome succeeds and the catalog shows the copy as lost", () => {
      expect(outcome.isOk()).toBe(true);
      if (outcome.isOk()) {
        expect(outcome.value.lost).toBe(true);
      }
    });
  });
});

describe("Given no copy exists in the catalog for the id I have", () => {
  let collection: LibraryCollection;
  let declareBookLost: DeclareBookLostUseCase;

  beforeEach(() => {
    collection = new LibraryCollection();
    declareBookLost = new DeclareBookLostUseCase(collection);
  });

  describe("When I try to declare that id lost", () => {
    const unknownId = "ffffffff-ffff-ffff-ffff-ffffffffffff";
    let outcome: Awaited<ReturnType<DeclareBookLostUseCase["execute"]>>;

    beforeEach(async () => {
      outcome = await declareBookLost.execute(
        new DeclareBookLostCommand({ bookId: unknownId }),
      );
    });

    it("Then the catalog tells me that book was not found", () => {
      expect(outcome.isErr()).toBe(true);
      if (outcome.isErr()) {
        expect(outcome.error.name).toBe("BOOK_NOT_FOUND");
      }
    });
  });
});

describe("Given I have already declared a copy lost in the catalog", () => {
  let collection: LibraryCollection;
  let declareBookLost: DeclareBookLostUseCase;
  let bookId: string;

  beforeEach(async () => {
    collection = new LibraryCollection();
    declareBookLost = new DeclareBookLostUseCase(collection);
    bookId = await addCopyToCatalog(collection, { isbn: "978-3333333333" });
    await declareBookLost.execute(new DeclareBookLostCommand({ bookId }));
  });

  describe("When I try to declare the same copy lost again", () => {
    let outcome: Awaited<ReturnType<DeclareBookLostUseCase["execute"]>>;

    beforeEach(async () => {
      outcome = await declareBookLost.execute(
        new DeclareBookLostCommand({ bookId }),
      );
    });

    it("Then the use case refuses because the copy was already marked lost", () => {
      expect(outcome.isErr()).toBe(true);
      if (outcome.isErr()) {
        expect(outcome.error.name).toBe("BOOK_ALREADY_DECLARED_LOST");
      }
    });
  });
});
