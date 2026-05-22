import { Module } from "@nestjs/common";
import {
  DomainEventBusListener,
  DomainEventBusPublisher,
  InMemoryConnectors,
  InMemoryMessageRelayStateRepository,
} from "ontologic";

import { LibraryCollection } from "../../../domain/repositories/libraryCollection.repository";
import { LoanRegister } from "../../../domain/repositories/loanRegister.repository";
import {
  CONNECTORS,
  EVENT_LISTENER,
  EVENT_PUBLISHER,
  RELAY_REPO,
} from "../../../infrastructure/infra.tokens";
import { MessageRelayInitializer } from "../../../infrastructure/message-relay.initializer";
import { validateDomainEvent } from "../../../infrastructure/event.validator";

@Module({
  providers: [
    {
      provide: CONNECTORS,
      useFactory: () => new InMemoryConnectors(),
    },
    {
      provide: EVENT_PUBLISHER,
      useFactory: (connectors: InMemoryConnectors) =>
        new DomainEventBusPublisher({
          publisherConnector: connectors.publisher,
        }),
      inject: [CONNECTORS],
    },
    {
      provide: RELAY_REPO,
      useFactory: () => new InMemoryMessageRelayStateRepository(),
    },
    {
      provide: EVENT_LISTENER,
      useFactory: (connectors: InMemoryConnectors) =>
        new DomainEventBusListener({
          listenerConnector: connectors.listener,
          options: { validator: validateDomainEvent },
        }),
      inject: [CONNECTORS],
    },
    {
      provide: LibraryCollection,
      useFactory: () => new LibraryCollection(),
    },
    {
      provide: LoanRegister,
      useFactory: () => new LoanRegister(),
    },
    MessageRelayInitializer,
  ],

  exports: [LibraryCollection, LoanRegister, EVENT_LISTENER],
})
export class DomainRepositoriesModule {}
