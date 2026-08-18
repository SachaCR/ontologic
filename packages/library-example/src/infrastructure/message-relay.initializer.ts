import { Injectable, OnModuleInit, Inject } from "@nestjs/common";
import {
  DomainEventBusPublisher,
  DomainEventInterface,
  InMemoryMessageRelayStateRepository,
  MessageRelay,
} from "ontologic";

import { LibraryCollection } from "../domain/repositories/libraryCollection.repository";
import { LoanRegister } from "../domain/repositories/loanRegister.repository";
import { EVENT_PUBLISHER, RELAY_REPO } from "./infra.tokens";

@Injectable()
export class MessageRelayInitializer implements OnModuleInit {
  constructor(
    private readonly libraryCollection: LibraryCollection,
    private readonly loanRegister: LoanRegister,
    @Inject(RELAY_REPO)
    private readonly relayRepo: InMemoryMessageRelayStateRepository,
    @Inject(EVENT_PUBLISHER)
    private readonly publisher: DomainEventBusPublisher<DomainEventInterface>,
  ) {}

  onModuleInit() {
    const bookRelay = new MessageRelay(
      this.libraryCollection,
      this.relayRepo,
      "BOOK",
      this.publisher,
    );

    const loanRelay = new MessageRelay(
      this.loanRegister,
      this.relayRepo,
      "LOAN",
      this.publisher,
    );

    this.libraryCollection.onChanges(bookRelay.handler.bind(bookRelay));

    this.loanRegister.onChanges(loanRelay.handler.bind(loanRelay));
  }
}
