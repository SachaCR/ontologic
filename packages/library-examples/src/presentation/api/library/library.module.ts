import { Module } from "@nestjs/common";

import { AddBookController } from "./controllers/add-book.controller";
import { BookCountController } from "./controllers/book-count.controller";
import { DeclareBookLostController } from "./controllers/declare-book-lost.controller";
import { ListBooksController } from "./controllers/list-books.controller";
import { ListOutstandingLoansForMemberController } from "./controllers/list-outstanding-loans-for-member.controller";
import { ListLoansController } from "./controllers/list-loans.controller";
import { RecordBookReturnController } from "./controllers/record-book-return.controller";
import { RegisterLoanController } from "./controllers/register-loan.controller";
import { SearchBooksController } from "./controllers/search-books.controller";
import { BookCountService } from "./book-count.service";
import { DomainRepositoriesModule } from "./domain-repositories.module";
import { LibraryService } from "./library.service";

@Module({
  imports: [DomainRepositoriesModule],
  providers: [BookCountService, LibraryService],
  controllers: [
    SearchBooksController,
    ListBooksController,
    AddBookController,
    BookCountController,
    DeclareBookLostController,
    ListLoansController,
    ListOutstandingLoansForMemberController,
    RegisterLoanController,
    RecordBookReturnController,
  ],
})
export class LibraryModule {}
