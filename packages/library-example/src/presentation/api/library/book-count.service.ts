import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
} from "@nestjs/common";
import {
  DomainEventBusListener,
  IDomainEventBusListener,
  ReadModel,
} from "ontologic";

import { BookCreatedEvent, BookLostEvent } from "../../../domain/entities/book";
import {
  LoanCreatedEvent,
  LoanReturnedEvent,
} from "../../../domain/entities/loan";
import { EVENT_LISTENER } from "../../../infrastructure/infra.tokens";

type LibraryEvent =
  | BookCreatedEvent
  | BookLostEvent
  | LoanCreatedEvent
  | LoanReturnedEvent;

/**
 * How many copies the library has ever taken in, kept up to date by listening
 * rather than by counting rows.
 */
@Injectable()
export class BookCountService
  implements ReadModel<LibraryEvent>, OnModuleInit, OnModuleDestroy
{
  private bookCount = 0;

  constructor(
    @Inject(EVENT_LISTENER)
    private readonly eventListener: DomainEventBusListener<LibraryEvent>,
  ) {}

  subscribe(listener: IDomainEventBusListener<LibraryEvent>) {
    listener.listenTo("BOOK_CREATED", () => {
      this.bookCount++;
    });
  }

  onModuleInit() {
    this.subscribe(this.eventListener);

    void this.eventListener.start();
  }

  async onModuleDestroy() {
    await this.eventListener.stop();
  }

  /** Copies added since the library opened. */
  getBookCount(): number {
    return this.bookCount;
  }
}
