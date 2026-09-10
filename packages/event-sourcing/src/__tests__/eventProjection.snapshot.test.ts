import { describe, test, expect } from "vitest";

import {
  CreationEventNotFoundError,
  EventProjection,
  InvalidProjectedStateError,
} from "../index";

import {
  applyTestEventA,
  buildTestEvent,
  thrownBy,
  type TestEvent,
  type TestState,
} from "./testEvents";

/**
 * A counter whose whole state is a number. Legal — `State` is unconstrained
 * and a number is a JSON value — and the shape that a falsiness test on the
 * snapshot silently mishandled. `ontologic`'s own canonical read model is a
 * `bookCount = 0`, so a counter resting at zero is not a contrived case.
 */
type CounterEvent =
  | { name: "STARTED"; version: 1; payload: Record<string, never> }
  | { name: "INCREMENTED"; version: 1; payload: Record<string, never> };

function buildCounter(): EventProjection<number, CounterEvent> {
  const counter = new EventProjection<number, CounterEvent>("Counter");

  counter.mountCreationEventApplier("STARTED", () => 0);
  counter.mountEventApplier("INCREMENTED", ({ state }) => state + 1);

  return counter;
}

const started: CounterEvent = {
  name: "STARTED",
  version: 1,
  payload: {},
};

const incremented: CounterEvent = {
  name: "INCREMENTED",
  version: 1,
  payload: {},
};

describe("Component EventProjection", () => {
  describe("Given a snapshot whose state is zero", () => {
    describe("When I apply an event on top of it", () => {
      test("Then it folds onto the snapshot instead of discarding it", () => {
        expect(
          buildCounter().apply({
            snapshot: { state: 0, version: 500 },
            events: [incremented],
          }),
        ).toStrictEqual({ state: 1, version: 501 });
      });
    });

    describe("When the stream still contains the creation event", () => {
      // The same call shape with a truthy state throws — a stream replayed
      // onto a snapshot must not contain the event that created the entity.
      // With a zero state it used to return a fabricated state and version.
      test("Then it refuses, as it does for any other state", () => {
        expect(() => {
          buildCounter().apply({
            snapshot: { state: 0, version: 500 },
            events: [started, incremented],
          });
        }).toThrow("Unknown event applier: STARTED");
      });
    });
  });

  describe("Given a snapshot whose state is an empty string", () => {
    const text = new EventProjection<
      string,
      { name: "APPENDED"; version: 1; payload: { char: string } }
    >("Text");

    text.mountEventApplier("APPENDED", ({ event, state }) => {
      return state + event.payload.char;
    });

    describe("When I apply an event on top of it", () => {
      test("Then it folds onto the snapshot", () => {
        expect(
          text.apply({
            snapshot: { state: "", version: 3 },
            events: [{ name: "APPENDED", version: 1, payload: { char: "x" } }],
          }),
        ).toStrictEqual({ state: "x", version: 4 });
      });
    });
  });

  describe("Given a snapshot and no events", () => {
    describe("When I apply", () => {
      // A fold over nothing returns what it started from. Notably this needs
      // no creation applier — there is nothing to create.
      test("Then it returns the snapshot unchanged", () => {
        const projection = new EventProjection<TestState, TestEvent>(
          "TestEntity",
        );

        expect(
          projection.apply({
            snapshot: { state: { result: ["kept"] }, version: 12 },
            events: [],
          }),
        ).toStrictEqual({ state: { result: ["kept"] }, version: 12 });
      });
    });
  });

  describe("Given no snapshot and no events", () => {
    const projection = new EventProjection<TestState, TestEvent>("TestEntity");

    projection.mountCreationEventApplier("CreationEvent", () => ({
      result: [],
    }));

    describe("When I apply", () => {
      test("Then it throws CREATION_EVENT_NOT_FOUND saying it was empty", () => {
        const error = thrownBy(() => projection.apply({ events: [] }));

        expect(error).toBeInstanceOf(CreationEventNotFoundError);
        expect(error).toMatchObject({
          expected: "CreationEvent",
          received: undefined,
        });
        expect((error as Error).message).toContain("but it is empty");
      });
    });
  });

  describe("Given an applier that mutates the state it is handed", () => {
    const projection = new EventProjection<TestState, TestEvent>("TestEntity");

    projection.mountEventApplier("EventA", ({ event, state }) => {
      // Deliberately the wrong way to write an applier. The point is that
      // writing it this way cannot corrupt the caller's own object.
      state.result.push("mutated by " + event.name);
      return state;
    });

    describe("When I apply it over a state object I still hold", () => {
      const myState: TestState = { result: ["original"] };
      const snapshot = { state: myState, version: 1 };

      const result = projection.apply({
        snapshot,
        events: [buildTestEvent("EventA")],
      });

      test("Then my object is untouched", () => {
        expect(myState).toStrictEqual({ result: ["original"] });
        expect(snapshot.state).toBe(myState);
      });

      test("Then the returned state is a different object", () => {
        expect(result.state).not.toBe(myState);
        expect(result.state.result).not.toBe(myState.result);
      });

      test("Then the mutation landed on the returned state only", () => {
        expect(result.state).toStrictEqual({
          result: ["original", "mutated by EventA"],
        });
      });
    });
  });

  describe("Given a projection that has already folded a stream", () => {
    const projection = new EventProjection<TestState, TestEvent>("TestEntity");

    projection.mountEventApplier("EventA", applyTestEventA);

    const snapshot = { state: { result: [] as string[] }, version: 0 };
    const events = [buildTestEvent("EventA")];

    describe("When I fold the same stream again", () => {
      test("Then it returns the same result, having retained nothing", () => {
        const first = projection.apply({ snapshot, events });
        const second = projection.apply({ snapshot, events });

        expect(second).toStrictEqual(first);
        expect(second.state).not.toBe(first.state);
      });
    });

    describe("When I fold a second, unrelated stream through it", () => {
      test("Then the two folds do not contaminate each other", () => {
        const one = projection.apply({
          snapshot: { state: { result: ["one"] }, version: 5 },
          events,
        });

        const two = projection.apply({
          snapshot: { state: { result: ["two"] }, version: 9 },
          events,
        });

        expect(one).toStrictEqual({
          state: { result: ["one", "Applier A: I'm a test EventA"] },
          version: 6,
        });
        expect(two).toStrictEqual({
          state: { result: ["two", "Applier A: I'm a test EventA"] },
          version: 10,
        });
      });
    });
  });

  describe("Given a snapshot that came out of a previous apply", () => {
    const projection = new EventProjection<TestState, TestEvent>("TestEntity");

    projection.mountEventApplier("EventA", applyTestEventA);

    describe("When I feed it straight back in", () => {
      // Such a state skips the incoming JSON check — it was validated on the
      // way out. The result must be identical to validating it again.
      test("Then it folds correctly", () => {
        const first = projection.apply({
          snapshot: { state: { result: [] }, version: 0 },
          events: [buildTestEvent("EventA")],
        });

        const second = projection.apply({
          snapshot: first,
          events: [buildTestEvent("EventA")],
        });

        expect(second).toStrictEqual({
          state: {
            result: [
              "Applier A: I'm a test EventA",
              "Applier A: I'm a test EventA",
            ],
          },
          version: 2,
        });
      });
    });

    describe("When I mutate it into an invalid state and feed it back", () => {
      // Nothing is trusted on the way in, not even a state this projection
      // produced itself: the caller had it in between and may have changed it.
      test("Then it is rejected as an invalid initial state", () => {
        const handedOut = projection.apply({
          snapshot: { state: { result: [] }, version: 0 },
          events: [buildTestEvent("EventA")],
        });

        (handedOut.state as unknown as { when: Date }).when = new Date(0);

        const error = thrownBy(() =>
          projection.apply({ snapshot: handedOut, events: [] }),
        );

        expect(error).toBeInstanceOf(InvalidProjectedStateError);
        expect(error).toMatchObject({
          stage: "initial",
          code: "non-plain-object",
          path: "$.when",
        });
      });
    });

    describe("When I mutate it to hold a function", () => {
      // Caught by the incoming check, which is why `structuredClone` below it
      // needs no guard of its own: everything the clone would refuse has
      // already been rejected.
      test("Then it is rejected before the clone is attempted", () => {
        const handedOut = projection.apply({
          snapshot: { state: { result: [] }, version: 0 },
          events: [buildTestEvent("EventA")],
        });

        (handedOut.state as unknown as { fn: () => void }).fn = () => undefined;

        const error = thrownBy(() =>
          projection.apply({ snapshot: handedOut, events: [] }),
        );

        expect(error).toBeInstanceOf(InvalidProjectedStateError);
        expect(error).toMatchObject({ stage: "initial" });
      });
    });
  });

  describe("Given an event name mounted twice", () => {
    const projection = new EventProjection<TestState, TestEvent>("TestEntity");

    projection.mountEventApplier("EventA", () => ({ result: ["first"] }));
    projection.mountEventApplier("EventA", () => ({ result: ["second"] }));

    describe("When I apply that event", () => {
      test("Then the applier mounted last wins", () => {
        expect(
          projection.apply({
            snapshot: { state: { result: [] }, version: 0 },
            events: [buildTestEvent("EventA")],
          }).state,
        ).toStrictEqual({ result: ["second"] });
      });
    });
  });
});
