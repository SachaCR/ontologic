import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
} from "@nestjs/common";

import { LibraryService } from "../library.service";
import { unwrapResultOrThrow } from "../result-to-http";

@Controller("loans")
export class RegisterLoanController {
  constructor(private readonly libraryService: LibraryService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body() body: { bookId: string; memberId: string },
  ) {
    const result = await this.libraryService.registerLoan(body);
    return unwrapResultOrThrow(result);
  }
}
