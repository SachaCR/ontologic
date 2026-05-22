import { Controller, Get, Query } from "@nestjs/common";

import { LibraryService } from "../library.service";
import { unwrapResultOrThrow } from "../result-to-http";

@Controller("books")
export class SearchBooksController {
  constructor(private readonly libraryService: LibraryService) {}

  @Get("search")
  async search(
    @Query("title") title?: string,
    @Query("author") author?: string,
  ) {
    const result = await this.libraryService.searchBooks({ title, author });
    return unwrapResultOrThrow(result);
  }
}
