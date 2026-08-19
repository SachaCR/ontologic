import {
  Command,
  DomainEntity,
  DomainEvent,
  Repository,
  Result,
  UseCase,
  ok,
} from "ontologic";

/**
 * A use case whose event is built by a helper, kept as a fixture.
 *
 * The extractor resolves what reaches `saveWithEvents` by walking local
 * bindings — it does not follow calls out of the body. An event assembled in a
 * free function is therefore invisible to it, and the honest answer is to say
 * so rather than report an empty list, which reads identically to a query.
 *
 * Without this fixture the `use-case-events-undetermined` finding would have no
 * coverage, since every use case in the repository resolves cleanly.
 *
 * This file is never compiled against the workspace `ontologic`; it is only
 * parsed.
 */
interface TicketState {
  status: string;
}

export class TicketEscalated extends DomainEvent<
  "TICKET_ESCALATED",
  1,
  { ticketId: string }
> {
  constructor(entityId: string, payload: { ticketId: string }) {
    super({ name: "TICKET_ESCALATED", version: 1, entityId, payload });
  }
}

export class Ticket extends DomainEntity<TicketState> {
  static fromState(id: string, state: TicketState): Ticket {
    return new Ticket(id, state);
  }
}

export interface TicketRepository extends Repository<Ticket, TicketEscalated> {}

export class EscalateTicketCommand extends Command<
  "ESCALATE_TICKET",
  { ticketId: string }
> {
  constructor(payload: { ticketId: string }) {
    super({ name: "ESCALATE_TICKET", payload });
  }
}

/** The step that hides the event from a syntactic walk. */
function buildEscalation(ticket: Ticket): TicketEscalated {
  return new TicketEscalated(ticket.id(), { ticketId: ticket.id() });
}

export class EscalateTicketUseCase implements UseCase<
  EscalateTicketCommand,
  TicketState,
  never
> {
  constructor(private readonly tickets: TicketRepository) {}

  async execute(
    command: EscalateTicketCommand,
  ): Promise<Result<TicketState, never>> {
    const ticket = Ticket.fromState(command.payload.ticketId, {
      status: "OPEN",
    });

    const escalation = buildEscalation(ticket);

    const saved = await this.tickets.saveWithEvents(ticket, escalation);

    if (saved.isErr()) {
      throw saved.error;
    }

    return ok(ticket.readState() as TicketState);
  }
}
