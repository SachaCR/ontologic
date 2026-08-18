import {
  Controller,
  DefaultValuePipe,
  Get,
  ParseIntPipe,
  Query,
} from "@nestjs/common";

import { LibraryService } from "../library.service";
import { unwrapResultOrThrow } from "../result-to-http";

@Controller("books")
export class ListBooksController {
  constructor(private readonly libraryService: LibraryService) {}

  @Get()
  async list(
    @Query("limit", new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query("offset", new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    const result = await this.libraryService.listBooks({ limit, offset });
    return unwrapResultOrThrow(result);
  }
}
