import { Controller, Get, Param } from "@nestjs/common";

import { LibraryService } from "../library.service";
import { unwrapResultOrThrow } from "../result-to-http";

@Controller("member")
export class ListOutstandingLoansForMemberController {
  constructor(private readonly libraryService: LibraryService) {}

  @Get(":memberId/loans/outstanding")
  async list(@Param("memberId") memberId: string) {
    const result = await this.libraryService.listOutstandingLoansForMember(memberId);
    return unwrapResultOrThrow(result);
  }
}
