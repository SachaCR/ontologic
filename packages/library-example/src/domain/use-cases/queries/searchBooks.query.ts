import { Query } from "ontologic";

import { BookSearchCriteria } from "../../repositories/libraryCollection.repository";

export class SearchBooksQuery extends Query<
  "SEARCH_BOOKS",
  BookSearchCriteria
> {
  constructor(payload: BookSearchCriteria) {
    super({ name: "SEARCH_BOOKS", payload });
  }
}
