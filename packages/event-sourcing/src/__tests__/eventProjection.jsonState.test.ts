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
    const projection = new EventProjection<StateWithDate, TestEvent>({
      name: "TestEntity",
      appliers: {
        CreationEvent: ({ state }) => state,
        EventA: ({ state }) => state,
        EventB: ({ state }) => state,
        EventC: ({ state }) => state,
      },
    });

    describe("When I apply an event on top of it", () => {
      // Every applier here is a no-op, so nothing but the incoming state check
      // can produce an error: it has to run before the fold, or the caller
      // would get a misleading complaint about the events instead.
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
    const projection = new EventProjection<
      StateWithDate,
      TestEvent,
      "CreationEvent"
    >({
      name: "TestEntity",
      creationEvent: "CreationEvent",
      appliers: {
        CreationEvent: () => ({ at: new Date(0) }),
        EventA: ({ state }) => state,
        EventB: ({ state }) => state,
        EventC: ({ state }) => state,
      },
    });

    describe("When I apply the creation event without a snapshot", () => {
      // `stage` is "projected", not "initial": the creation applier is an
      // applier like any other now, so what it returns is a projected state.
      // "initial" has narrowed to mean one thing — the snapshot you passed in
      // was invalid.
      test("Then it throws INVALID_PROJECTED_STATE at the projected stage", () => {
        const error = thrownBy(() =>
          projection.apply({
            events: [buildTestEvent("CreationEvent")],
          }),
        );

        expect(error).toBeInstanceOf(InvalidProjectedStateError);
        expect(error).toMatchObject({
          stage: "projected",
          code: "non-plain-object",
          path: "$.at",
        });
      });
    });
  });

  describe("Given an applier returning a state that is not JSON compatible", () => {
    const projection = new EventProjection<LooseState, TestEvent>({
      name: "TestEntity",
      appliers: {
        CreationEvent: ({ state }) => state,
        EventA: () => ({ value: new Map() }),
        EventB: ({ state }) => state,
        EventC: ({ state }) => state,
      },
    });

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
