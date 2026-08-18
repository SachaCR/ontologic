import {
  DomainEventBusListener,
  DomainEventBusPublisher,
  InMemoryConnectors,
  MessageRelay,
  InMemoryMessageRelayStateRepository,
} from "ontologic";

import { LibraryCollection } from "../domain/repositories/libraryCollection.repository";
import { LoanRegister } from "../domain/repositories/loanRegister.repository";
import { validateDomainEvent } from "./event.validator";

export async function bootstrapDependencies() {
  // DOMAIN EVENT BUS PUBLISHER
  const eventBusConnectors = new InMemoryConnectors();

  const eventPublisher = new DomainEventBusPublisher({
    publisherConnector: eventBusConnectors.publisher,
  });

  // DOMAIN REPOSITORY
  const libraryCollection = new LibraryCollection();
  const loanRegister = new LoanRegister();

  // MESSAGE RELAY
  const messageRelayRepository = new InMemoryMessageRelayStateRepository();

  const bookMessageRelay = new MessageRelay(
    libraryCollection,
    messageRelayRepository,
    "BOOK",
    eventPublisher,
  );

  const loanMessageRelay = new MessageRelay(
    loanRegister,
    messageRelayRepository,
    "LOAN",
    eventPublisher,
  );

  // WIRE THE MESSAGE RELAY
  libraryCollection.onChanges(bookMessageRelay.handler.bind(bookMessageRelay));
  loanRegister.onChanges(loanMessageRelay.handler.bind(loanMessageRelay));

  // DOMAIN EVENT BUS LISTENER
  const eventListener = new DomainEventBusListener({
    listenerConnector: eventBusConnectors.listener,
    options: { validator: validateDomainEvent },
  });

  return {
    loanRegister,
    libraryCollection,
    eventListener,
  };
}
