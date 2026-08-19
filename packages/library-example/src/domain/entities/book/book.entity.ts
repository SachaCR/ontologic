import { randomUUID } from "node:crypto";
import { DomainEntity, Result, err, ok } from "ontologic";
import { BookAlreadyDeclaredLostError } from "./errors/book.errors";
import { BookCreatedEvent } from "./events/bookCreated.event";
import { BookLostEvent } from "./events/bookLost.event";

export type BookEvent = BookLostEvent | BookCreatedEvent;

export interface BookState {
  title: string;
  author: string;
  isbn: string;
  category: string;
  tags: string[];
  lost: boolean;
}

/**
 * A single copy the library owns and can lend out. Two copies of the same ISBN
 * are two Books, and only one of them can be out at a time.
 */
export class Book extends DomainEntity<BookState> {
  private constructor(id: string, state: BookState) {
    super(id, state);
  }

  static fromState(id: string, state: BookState) {
    return new Book(id, state);
  }

  /** Registers a new copy in the collection. A copy is never added already lost. */
  static create(state: Omit<BookState, "lost">): {
    book: Book;
    event: BookCreatedEvent;
  } {
    const id = randomUUID();

    const event = new BookCreatedEvent(id, {
      ...state,
      lost: false,
    });

    return {
      event,
      book: new Book(id, { ...state, lost: false }),
    };
  }

  /**
   * Marks the copy as lost and takes it out of circulation. Declaring it a
   * second time is refused, so the loss is never recorded twice.
   */
  declareLost(): Result<BookLostEvent, BookAlreadyDeclaredLostError> {
    if (this.state.lost) {
      return err(new BookAlreadyDeclaredLostError(this.id()));
    }

    this.state.lost = true;

    return ok(new BookLostEvent(this.id()));
  }
}
