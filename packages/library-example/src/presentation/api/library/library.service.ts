import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Result, err, ok } from "ontologic";

import { Book, BookState } from "../../../domain/entities/book";
import { LoanState } from "../../../domain/entities/loan";
import {
  BookSearchCriteria,
  LibraryCollection,
} from "../../../domain/repositories/libraryCollection.repository";
import { LoanRegister } from "../../../domain/repositories/loanRegister.repository";
import { addBook as addBookUseCase } from "../../../domain/use-cases/addBook.use-case";
import { declareBookLost as declareBookLostUseCase } from "../../../domain/use-cases/declareBookLost.use-case";
import { recordBookReturn as recordBookReturnUseCase } from "../../../domain/use-cases/recordBookReturn.use-case";
import { listOutstandingLoansForMember as listOutstandingLoansForMemberUseCase } from "../../../domain/use-cases/listOutstandingLoansForMember.use-case";
import { registerLoan as registerLoanUseCase } from "../../../domain/use-cases/registerLoan.use-case";
import { searchBooks as searchBooksUseCase } from "../../../domain/use-cases/searchBooks.use-case";

import { FIFTY_REAL_BOOKS } from "./seed-books.data";

@Injectable()
export class LibraryService implements OnModuleInit {
  private readonly logger = new Logger(LibraryService.name);

  constructor(
    private readonly libraryCollection: LibraryCollection,
    private readonly loanRegister: LoanRegister,
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
  }): Promise<Result<BookState, Error>> {
    return addBookUseCase(bookData, {
      libraryCollection: this.libraryCollection,
    });
  }

  declareBookLost(lostDeclaration: {
    bookId: string;
  }): Promise<Result<BookState, Error>> {
    return declareBookLostUseCase(lostDeclaration, {
      libraryCollection: this.libraryCollection,
    });
  }

  searchBooks(
    catalogueQuery: BookSearchCriteria,
  ): Promise<Result<BookState[], Error>> {
    return searchBooksUseCase(catalogueQuery, {
      libraryCollection: this.libraryCollection,
    });
  }

  registerLoan(lendingRequest: {
    bookId: string;
    memberId: string;
  }): Promise<Result<LoanState, Error>> {
    return registerLoanUseCase(lendingRequest, {
      libraryCollection: this.libraryCollection,
      loanRegister: this.loanRegister,
    });
  }

  recordBookReturn(returnReceipt: {
    loanId: string;
  }): Promise<Result<LoanState, Error>> {
    return recordBookReturnUseCase(returnReceipt, {
      loanRegister: this.loanRegister,
    });
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
      Error
    >
  > {
    const result = await listOutstandingLoansForMemberUseCase(
      { memberId },
      { loanRegister: this.loanRegister },
    );
    if (result.isErr()) {
      return err(result.error);
    }
    return ok({ memberId, loans: result.value });
  }
}
