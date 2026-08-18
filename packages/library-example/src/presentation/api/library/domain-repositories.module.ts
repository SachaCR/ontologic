import { Module } from "@nestjs/common";
import {
  DomainEventBusListener,
  DomainEventBusPublisher,
  InMemoryConnectors,
  InMemoryMessageRelayStateRepository,
} from "ontologic";

import { LibraryCollection } from "../../../domain/repositories/libraryCollection.repository";
import { LoanRegister } from "../../../domain/repositories/loanRegister.repository";
import { AddBookUseCase } from "../../../domain/use-cases/addBook.use-case";
import { DeclareBookLostUseCase } from "../../../domain/use-cases/declareBookLost.use-case";
import { ListOutstandingLoansForMemberUseCase } from "../../../domain/use-cases/listOutstandingLoansForMember.use-case";
import { RecordBookReturnUseCase } from "../../../domain/use-cases/recordBookReturn.use-case";
import { RegisterLoanUseCase } from "../../../domain/use-cases/registerLoan.use-case";
import { SearchBooksUseCase } from "../../../domain/use-cases/searchBooks.use-case";
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

    // Use cases are plain domain classes — they carry no framework decorators,
    // so they are constructed here rather than being `@Injectable()`.
    {
      provide: AddBookUseCase,
      useFactory: (collection: LibraryCollection) =>
        new AddBookUseCase(collection),
      inject: [LibraryCollection],
    },
    {
      provide: DeclareBookLostUseCase,
      useFactory: (collection: LibraryCollection) =>
        new DeclareBookLostUseCase(collection),
      inject: [LibraryCollection],
    },
    {
      provide: SearchBooksUseCase,
      useFactory: (collection: LibraryCollection) =>
        new SearchBooksUseCase(collection),
      inject: [LibraryCollection],
    },
    {
      provide: RegisterLoanUseCase,
      useFactory: (collection: LibraryCollection, loans: LoanRegister) =>
        new RegisterLoanUseCase(collection, loans),
      inject: [LibraryCollection, LoanRegister],
    },
    {
      provide: RecordBookReturnUseCase,
      useFactory: (loans: LoanRegister) => new RecordBookReturnUseCase(loans),
      inject: [LoanRegister],
    },
    {
      provide: ListOutstandingLoansForMemberUseCase,
      useFactory: (loans: LoanRegister) =>
        new ListOutstandingLoansForMemberUseCase(loans),
      inject: [LoanRegister],
    },
  ],

  exports: [
    LibraryCollection,
    LoanRegister,
    EVENT_LISTENER,
    AddBookUseCase,
    DeclareBookLostUseCase,
    SearchBooksUseCase,
    RegisterLoanUseCase,
    RecordBookReturnUseCase,
    ListOutstandingLoansForMemberUseCase,
  ],
})
export class DomainRepositoriesModule {}
