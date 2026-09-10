import { describe, test, expect } from "vitest";

import { EventProjection, InvalidProjectedStateError } from "../index";

import { buildTestEvent, thrownBy, type TestEvent } from "./testEvents";

interface StateWithDate {
  at: Date;
}

interface LooseState {
  value: unknown;
}

describe("Component EventProjection", () => {
  describe("Given a snapshot whose state is not JSON compatible", () => {
    const projection = new EventProjection<StateWithDate, TestEvent>(
      "TestEntity",
    );

    describe("When I apply an event on top of it", () => {
      // No applier is mounted for EventA on purpose: the state check has to
      // win over the applier lookup, or the caller gets a misleading error
      // about a missing applier when the real problem is the snapshot.
      test("Then it throws INVALID_PROJECTED_STATE locating the Date", () => {
        const error = thrownBy(() =>
          projection.apply({
            snapshot: { state: { at: new Date(0) }, version: 1 },
            events: [buildTestEvent("EventA")],
          }),
        );

        expect(error).toBeInstanceOf(InvalidProjectedStateError);
        expect(error).toMatchObject({
          name: "INVALID_PROJECTED_STATE",
          projectionName: "TestEntity",
          stage: "initial",
          code: "non-plain-object",
          path: "$.at",
          reason: "Date instance instead of a plain object",
        });
      });
    });
  });

  describe("Given a creation event applier returning a state that is not JSON compatible", () => {
    const projection = new EventProjection<StateWithDate, TestEvent>(
      "TestEntity",
    );

    projection.mountCreationEventApplier("CreationEvent", () => ({
      at: new Date(0),
    }));

    describe("When I apply the creation event without a snapshot", () => {
      test("Then it throws INVALID_PROJECTED_STATE at the initial stage", () => {
        const error = thrownBy(() =>
          projection.apply({
            events: [buildTestEvent("CreationEvent")],
          }),
        );

        expect(error).toBeInstanceOf(InvalidProjectedStateError);
        expect(error).toMatchObject({
          stage: "initial",
          code: "non-plain-object",
          path: "$.at",
        });
      });
    });
  });

  describe("Given an applier returning a state that is not JSON compatible", () => {
    const projection = new EventProjection<LooseState, TestEvent>("TestEntity");

    projection.mountEventApplier("EventA", () => ({ value: new Map() }));

    describe("When I apply that event", () => {
      test("Then it throws INVALID_PROJECTED_STATE at the projected stage", () => {
        const error = thrownBy(() =>
          projection.apply({
            snapshot: { state: { value: 1 }, version: 4 },
            events: [buildTestEvent("EventA")],
          }),
        );

        expect(error).toBeInstanceOf(InvalidProjectedStateError);
        expect(error).toMatchObject({
          stage: "projected",
          code: "non-plain-object",
          path: "$.value",
          reason: "Map instance instead of a plain object",
        });
        expect((error as Error).message).toContain(
          "The projected state is not JSON compatible",
        );
      });
    });
  });
});
