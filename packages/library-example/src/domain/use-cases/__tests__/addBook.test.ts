import { beforeEach, describe, expect, it } from "vitest";
import { addBook } from "../addBook.use-case";
import { LibraryCollection } from "../../repositories/libraryCollection.repository";
import { sampleCatalogueEntry } from "./helpers";

describe("Given I have the bibliographic details for a new copy to list in the catalog", () => {
  let collection: LibraryCollection;

  beforeEach(() => {
    collection = new LibraryCollection();
  });

  describe("When I add that copy through the add-book use case", () => {
    let outcome: Awaited<ReturnType<typeof addBook>>;

    beforeEach(async () => {
      outcome = await addBook(
        { ...sampleCatalogueEntry, isbn: "978-1111111111" },
        { libraryCollection: collection },
      );
    });

    it("Then the outcome is successful and the returned state matches what I submitted", () => {
      expect(outcome.isOk()).toBe(true);
      if (outcome.isOk()) {
        expect(outcome.value).toMatchObject({
          ...sampleCatalogueEntry,
          isbn: "978-1111111111",
          lost: false,
        });
      }
    });

    it("Then the catalog now holds that copy so I can retrieve it from the collection", async () => {
      expect(outcome.isOk()).toBe(true);
      if (!outcome.isOk()) return;
      const listed = await collection.list({ limit: 10, offset: 0 });
      expect(listed.isOk()).toBe(true);
      if (!listed.isOk()) return;
      const found = listed.value.data.find(
        (b) => b.readState().isbn === "978-1111111111",
      );
      expect(found).toBeDefined();
      expect(found!.readState().title).toBe(sampleCatalogueEntry.title);
    });
  });
});
