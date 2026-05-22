import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
} from "@nestjs/common";
import { DomainEventBusListener } from "ontologic";

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

@Injectable()
export class BookCountService implements OnModuleInit, OnModuleDestroy {
  private bookCount = 0;

  constructor(
    @Inject(EVENT_LISTENER)
    private readonly eventListener: DomainEventBusListener<LibraryEvent>,
  ) {}

  onModuleInit() {
    this.eventListener.listenTo("BOOK_CREATED", () => {
      this.bookCount++;
    });

    void this.eventListener.start();
  }

  async onModuleDestroy() {
    await this.eventListener.stop();
  }

  getBookCount(): number {
    return this.bookCount;
  }
}
