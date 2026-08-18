import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
} from "@nestjs/common";

import { LibraryService } from "../library.service";
import { unwrapResultOrThrow } from "../result-to-http";

@Controller("books")
export class AddBookController {
  constructor(private readonly libraryService: LibraryService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async add(
    @Body()
    body: {
      title: string;
      author: string;
      isbn: string;
      category: string;
      tags: string[];
    },
  ) {
    const result = await this.libraryService.addBook(body);
    return unwrapResultOrThrow(result);
  }
}
