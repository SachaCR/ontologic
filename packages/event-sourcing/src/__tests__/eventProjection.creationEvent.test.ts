import { describe, test, expect } from "vitest";

import {
  CreationEventNotFoundError,
  EventProjection,
  NoCreationEventApplierError,
  UnknownEventApplierError,
} from "../index";

import {
  applyCreationEvent,
  applyTestEventA,
  applyTestEventB,
  applyTestEventC,
  buildTestEvent,
  thrownBy,
  type TestEvent,
  type TestState,
} from "./testEvents";

describe("Component EventProjection", () => {
  describe("Given an event projection without creation event applier", () => {
    // No `creation`, so `apply` has nothing to build a first state from.
    const testProjection = new EventProjection<TestState, TestEvent>({
      name: "TestEntity",
      appliers: {
        CreationEvent: ({ state }) => state,
        EventA: applyTestEventA,
        EventB: applyTestEventB,
        EventC: applyTestEventC,
      },
    });

    const eventList = [
      buildTestEvent("EventA"),
      buildTestEvent("EventB"),
      buildTestEvent("EventC"),
    ];

    describe("When I apply events without initial state", () => {
      test("Then it throws NO_CREATION_EVENT_APPLIER", () => {
        const error = thrownBy(() =>
          testProjection.apply({
            events: eventList,
          }),
        );

        expect(error).toBeInstanceOf(NoCreationEventApplierError);
        expect(error).toMatchObject({
          name: "NO_CREATION_EVENT_APPLIER",
          projectionName: "TestEntity",
        });
      });
    });
  });

  describe("Given an event projection with creation event applier", () => {
    const testProjection = new EventProjection<
      TestState,
      TestEvent,
      "CreationEvent"
    >({
      name: "TestEntity",
      creation: { event: "CreationEvent", applier: applyCreationEvent },
      appliers: {
        EventA: applyTestEventA,
        EventB: applyTestEventB,
        EventC: applyTestEventC,
      },
    });

    describe("When I apply events without initial state", () => {
      describe("And the first event is a creation event", () => {
        const eventList = [
          buildTestEvent("CreationEvent"),
          buildTestEvent("EventA"),
          buildTestEvent("EventB"),
          buildTestEvent("EventC"),
        ];

        test("Then it returns a state", () => {
          const result = testProjection.apply({
            events: eventList,
          });

          expect(result.state).toStrictEqual({
            result: [
              "Creation Event: I'm a test CreationEvent",
              "Applier A: I'm a test EventA",
              "Applier B: I'm a test EventB",
              "Applier C: I'm a test EventC",
            ],
          });
          expect(result.version).toStrictEqual(4);
        });
      });

      describe("And the first event is NOT a creation event", () => {
        const eventList = [
          buildTestEvent("EventA"),
          buildTestEvent("EventB"),
          buildTestEvent("EventC"),
        ];

        test("Then it throws CREATION_EVENT_NOT_FOUND naming both events", () => {
          const error = thrownBy(() =>
            testProjection.apply({
              events: eventList,
            }),
          );

          expect(error).toBeInstanceOf(CreationEventNotFoundError);
          expect(error).toMatchObject({
            name: "CREATION_EVENT_NOT_FOUND",
            projectionName: "TestEntity",
            expected: "CreationEvent",
            received: "EventA",
          });
        });
      });
    });

    describe("When I apply events with an initial state", () => {
      describe("And the first event is NOT a creation event", () => {
        const initialState = {
          result: ["There was some history before."],
        };
        const eventList = [
          buildTestEvent("EventA"),
          buildTestEvent("EventB"),
          buildTestEvent("EventC"),
        ];

        test("Then it returns a state", () => {
          const result = testProjection.apply({
            snapshot: {
              state: initialState,
              version: 587,
            },
            events: eventList,
          });

          expect(result.state).toStrictEqual({
            result: [
              "There was some history before.",
              "Applier A: I'm a test EventA",
              "Applier B: I'm a test EventB",
              "Applier C: I'm a test EventC",
            ],
          });
          expect(result.version).toStrictEqual(590);
        });
      });

      describe("And the first event is a creation event", () => {
        const initialState = {
          result: ["There was some history before."],
        };
        const eventList = [
          buildTestEvent("CreationEvent"),
          buildTestEvent("EventA"),
          buildTestEvent("EventB"),
          buildTestEvent("EventC"),
        ];

        test("Then it throws UNKNOWN_EVENT_APPLIER for the creation event", () => {
          const error = thrownBy(() =>
            testProjection.apply({
              snapshot: {
                state: initialState,
                version: 587,
              },
              events: eventList,
            }),
          );

          expect(error).toBeInstanceOf(UnknownEventApplierError);
          expect(error).toMatchObject({
            name: "UNKNOWN_EVENT_APPLIER",
            eventName: "CreationEvent",
            eventIndex: 0,
            streamLength: 4,
          });
        });
      });
    });
  });
});
