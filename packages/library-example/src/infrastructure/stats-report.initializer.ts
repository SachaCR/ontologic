import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { DomainEventBusListener } from "ontologic";

import {
  LibraryEvent,
  StatsReport,
} from "../domain/read-models/statsReport.read-model";
import { EVENT_LISTENER } from "./infra.tokens";

/**
 * Wires the stats projection to the bus, and nothing else.
 *
 * `StatsReport` is a plain domain class, so somebody has to register its
 * handlers before the listener starts — handlers registered afterwards never
 * run. That ordering is a hosting concern, so it lives out here with the
 * framework rather than inside the projection, which is what lets the projection
 * be tested without either.
 */
@Injectable()
export class StatsReportInitializer implements OnModuleInit, OnModuleDestroy {
  constructor(
    private readonly statsReport: StatsReport,
    @Inject(EVENT_LISTENER)
    private readonly eventListener: DomainEventBusListener<LibraryEvent>,
  ) {}

  onModuleInit() {
    this.statsReport.subscribe(this.eventListener);

    void this.eventListener.start();
  }

  async onModuleDestroy() {
    await this.eventListener.stop();
  }
}
