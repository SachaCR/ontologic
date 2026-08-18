import { Controller, Param, Post } from "@nestjs/common";

import { LibraryService } from "../library.service";
import { unwrapResultOrThrow } from "../result-to-http";

@Controller("books")
export class DeclareBookLostController {
  constructor(private readonly libraryService: LibraryService) {}

  @Post(":bookId/lost")
  async declareLost(@Param("bookId") bookId: string) {
    const result = await this.libraryService.declareBookLost({ bookId });
    return unwrapResultOrThrow(result);
  }
}
