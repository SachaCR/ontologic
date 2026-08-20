import { Controller, Get } from "@nestjs/common";

import { LibraryService } from "../library.service";
import { unwrapResultOrThrow } from "../result-to-http";

@Controller("stats")
export class BookCountController {
  constructor(private readonly libraryService: LibraryService) {}

  @Get("books/count")
  async getBookCount() {
    const result = await this.libraryService.bookCount();
    return unwrapResultOrThrow(result);
  }
}
