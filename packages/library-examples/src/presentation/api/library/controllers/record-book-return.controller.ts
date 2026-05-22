import { Controller, Param, Post } from "@nestjs/common";

import { LibraryService } from "../library.service";
import { unwrapResultOrThrow } from "../result-to-http";

@Controller("loans")
export class RecordBookReturnController {
  constructor(private readonly libraryService: LibraryService) {}

  @Post(":loanId/return")
  async recordReturn(@Param("loanId") loanId: string) {
    const result = await this.libraryService.recordBookReturn({ loanId });
    return unwrapResultOrThrow(result);
  }
}
