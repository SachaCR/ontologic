import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Result, err, ok } from "ontologic";

import { Book, BookState } from "../../../domain/entities/book";
import { LoanState } from "../../../domain/entities/loan";
import { LibraryStatsState } from "../../../domain/entities/libraryStats";
import {
  BookSearchCriteria,
  LibraryCollection,
} from "../../../domain/repositories/libraryCollection.repository";
import { LoanRegister } from "../../../domain/repositories/loanRegister.repository";
import { AddBookUseCase } from "../../../domain/use-cases/addBook.use-case";
import { DeclareBookLostUseCase } from "../../../domain/use-cases/declareBookLost.use-case";
import { GetBookCountUseCase } from "../../../domain/use-cases/getBookCount.use-case";
import { RecordBookReturnUseCase } from "../../../domain/use-cases/recordBookReturn.use-case";
import { ListOutstandingLoansForMemberUseCase } from "../../../domain/use-cases/listOutstandingLoansForMember.use-case";
import {
  RegisterLoanError,
  RegisterLoanUseCase,
} from "../../../domain/use-cases/registerLoan.use-case";
import { SearchBooksUseCase } from "../../../domain/use-cases/searchBooks.use-case";
import { AddBookCommand } from "../../../domain/use-cases/commands/addBook.command";
import { DeclareBookLostCommand } from "../../../domain/use-cases/commands/declareBookLost.command";
import { RecordBookReturnCommand } from "../../../domain/use-cases/commands/recordBookReturn.command";
import { RegisterLoanCommand } from "../../../domain/use-cases/commands/registerLoan.command";
import { SearchBooksQuery } from "../../../domain/use-cases/queries/searchBooks.query";
import { ListOutstandingLoansForMemberQuery } from "../../../domain/use-cases/queries/listOutstandingLoansForMember.query";
import { GetBookCountQuery } from "../../../domain/use-cases/queries/getBookCount.query";
import {
  BookAlreadyDeclaredLostError,
  BookNotFoundError,
} from "../../../domain/entities/book/errors/book.errors";
import {
  LoanAlreadyReturnedError,
  LoanNotFoundError,
} from "../../../domain/entities/loan/errors/loan.errors";

import { FIFTY_REAL_BOOKS } from "./seed-books.data";

@Injectable()
export class LibraryService implements OnModuleInit {
  private readonly logger = new Logger(LibraryService.name);

  constructor(
    private readonly libraryCollection: LibraryCollection,
    private readonly loanRegister: LoanRegister,
    private readonly addBookUseCase: AddBookUseCase,
    private readonly declareBookLostUseCase: DeclareBookLostUseCase,
    private readonly searchBooksUseCase: SearchBooksUseCase,
    private readonly registerLoanUseCase: RegisterLoanUseCase,
    private readonly recordBookReturnUseCase: RecordBookReturnUseCase,
    private readonly listOutstandingLoansForMemberUseCase: ListOutstandingLoansForMemberUseCase,
    private readonly getBookCountUseCase: GetBookCountUseCase,
  ) {}

  onModuleInit() {
    void this.seedFiftyRealBooksIfEmpty().catch((cause: unknown) => {
      this.logger.error("Failed to seed demo catalogue", cause);
    });
  }

  private async seedFiftyRealBooksIfEmpty(): Promise<void> {
    const listed = await this.libraryCollection.list({ limit: 1, offset: 0 });

    if (listed.isErr() || listed.value.data.length > 0) {
      return;
    }

    for (const row of FIFTY_REAL_BOOKS) {
      const { book, event } = Book.create({ ...row });

      const saved = await this.libraryCollection.saveWithEvents(book, event);

      if (saved.isErr()) {
        this.logger.error(saved.error);
        return;
      }
    }
  }

  addBook(bookData: {
    title: string;
    author: string;
    isbn: string;
    category: string;
    tags: string[];
  }): Promise<Result<BookState, never>> {
    return this.addBookUseCase.execute(new AddBookCommand(bookData));
  }

  declareBookLost(lostDeclaration: {
    bookId: string;
  }): Promise<
    Result<BookState, BookNotFoundError | BookAlreadyDeclaredLostError>
  > {
    return this.declareBookLostUseCase.execute(
      new DeclareBookLostCommand(lostDeclaration),
    );
  }

  searchBooks(
    catalogueQuery: BookSearchCriteria,
  ): Promise<Result<BookState[], never>> {
    return this.searchBooksUseCase.execute(
      new SearchBooksQuery(catalogueQuery),
    );
  }

  registerLoan(lendingRequest: {
    bookId: string;
    memberId: string;
  }): Promise<Result<LoanState, RegisterLoanError>> {
    return this.registerLoanUseCase.execute(
      new RegisterLoanCommand(lendingRequest),
    );
  }

  recordBookReturn(returnReceipt: {
    loanId: string;
  }): Promise<Result<LoanState, LoanNotFoundError | LoanAlreadyReturnedError>> {
    return this.recordBookReturnUseCase.execute(
      new RecordBookReturnCommand(returnReceipt),
    );
  }

  async listBooks(params: { limit: number; offset: number }): Promise<
    Result<
      {
        limit: number;
        offset: number;
        books: Array<{ id: string } & BookState>;
      },
      Error
    >
  > {
    const listed = await this.libraryCollection.list(params);
    if (listed.isErr()) {
      return err(listed.error);
    }
    return ok({
      limit: listed.value.limit,
      offset: listed.value.offset,
      books: listed.value.data.map((book) => ({
        id: book.id(),
        ...book.readState(),
      })),
    });
  }

  async listLoans(params: { limit: number; offset: number }): Promise<
    Result<
      {
        limit: number;
        offset: number;
        loans: Array<{ id: string } & LoanState>;
      },
      Error
    >
  > {
    const listed = await this.loanRegister.list(params);
    if (listed.isErr()) {
      return err(listed.error);
    }
    return ok({
      limit: listed.value.limit,
      offset: listed.value.offset,
      loans: listed.value.data.map((loan) => ({
        id: loan.id(),
        ...loan.readState(),
      })),
    });
  }

  async listOutstandingLoansForMember(
    memberId: string,
  ): Promise<
    Result<
      { memberId: string; loans: Array<{ id: string } & LoanState> },
      never
    >
  > {
    const result = await this.listOutstandingLoansForMemberUseCase.execute(
      new ListOutstandingLoansForMemberQuery({ memberId }),
    );
    if (result.isErr()) {
      return err(result.error);
    }
    return ok({ memberId, loans: result.value });
  }

  /**
   * How many copies the library has taken in. Answered from the stats the
   * projection has already folded, not by counting the collection.
   */
  async bookCount(): Promise<Result<LibraryStatsState, never>> {
    return this.getBookCountUseCase.execute(new GetBookCountQuery());
  }
}
