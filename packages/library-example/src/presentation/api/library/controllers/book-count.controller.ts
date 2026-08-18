import { Controller, Get } from "@nestjs/common";

import { BookCountService } from "../book-count.service";

@Controller("books")
export class BookCountController {
  constructor(private readonly bookCountService: BookCountService) {}

  @Get("count")
  getBookCount() {
    return { bookCount: this.bookCountService.getBookCount() };
  }
}
