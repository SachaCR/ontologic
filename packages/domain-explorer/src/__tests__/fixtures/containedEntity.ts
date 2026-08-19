import { DomainEntity } from "ontologic";

/**
 * One DomainEntity held inside another, kept as a fixture.
 *
 * `kind: "entity"` records that a class extends DomainEntity. It does not say
 * the class is an aggregate root — that is `aggregateRoots`, which is every
 * entity no `contains` edge points at. The two questions only come apart when
 * one entity holds another, and no example in this repository does: the shipped
 * corpora are single-entity aggregates, so every entity in them is a root and a
 * renderer that confused the two would still look correct on all of them.
 *
 * A sub-entity is a third thing again — a plain class with `serialize` and
 * `static fromState` and no heritage — so it is here too, to pin all three
 * apart in one model.
 *
 * This file is never compiled against the workspace `ontologic`; it is only
 * parsed.
 */
interface OdometerState {
  km: number;
}

/** A sub-entity: carries state, but does not extend anything. */
export class Odometer {
  private constructor(private readonly state: OdometerState) {}

  static fromState(state: OdometerState): Odometer {
    return new Odometer(state);
  }

  serialize(): OdometerState {
    return { km: this.state.km };
  }
}

export interface VehicleState {
  plate: string;
  odometer: Odometer;
}

/** An entity, and NOT a root — `Fleet` below holds it. */
export class Vehicle extends DomainEntity<VehicleState> {
  static fromState(id: string, state: VehicleState): Vehicle {
    return new Vehicle(id, state);
  }
}

export interface FleetState {
  name: string;
  vehicles: Map<string, Vehicle>;
}

/** The aggregate root. */
export class Fleet extends DomainEntity<FleetState> {
  static fromState(id: string, state: FleetState): Fleet {
    return new Fleet(id, state);
  }
}
