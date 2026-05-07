import { DomainEvent, InMemoryRepository } from "../..";
import { Workflow } from "../workflow";

export class WorkflowRepository extends InMemoryRepository<
  Workflow<unknown>,
  DomainEvent<any, any, any>
> {
  constructor() {
    super(Workflow.fromState);
  }
}
