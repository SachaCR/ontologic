import { DomainEntity, ValueObject } from "ontologic";

/**
 * An aggregate holding a wide union of interchangeable value objects, kept as a
 * fixture.
 *
 * A union alias in a state field becomes a "family" — one collapsed box in the
 * diagram standing for all its members, so a row of near-identical siblings does
 * not swamp the shape of the aggregate. The page can unfold that box, which only
 * works because the members are leaves; the generator collapses a family exactly
 * when none of them holds anything.
 *
 * Nothing in this repository has a union of that kind, so without this fixture
 * both the collapsing and the unfolding are only exercised by a checkout that
 * lives outside it.
 *
 * This file is never compiled against the workspace `ontologic`; it is only
 * parsed.
 */
export class Celsius extends ValueObject<{ degrees: number }> {}
export class Fahrenheit extends ValueObject<{ degrees: number }> {}
export class Kelvin extends ValueObject<{ degrees: number }> {}
export class Pascal extends ValueObject<{ value: number }> {}

/** The alias the diagram names the collapsed box after. */
export type Reading = Celsius | Fahrenheit | Kelvin | Pascal;

export interface SensorState {
  serial: string;
  reading: Reading;
}

export class Sensor extends DomainEntity<SensorState> {
  static fromState(id: string, state: SensorState): Sensor {
    return new Sensor(id, state);
  }
}
