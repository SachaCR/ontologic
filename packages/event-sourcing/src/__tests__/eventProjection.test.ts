import { describe, test, expect } from "vitest";

import { EventProjection, UnknownEventApplierError } from "../index";

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
  describe("Given an event projection", () => {
    const testProjection = new EventProjection<
      TestState,
      TestEvent,
      "CreationEvent"
    >({
      name: "TestEntity",
      creationEvent: "CreationEvent",
      appliers: {
        CreationEvent: applyCreationEvent,
        EventA: applyTestEventA,
        EventB: applyTestEventB,
        EventC: applyTestEventC,
      },
    });

    describe("When I read its name", () => {
      test("Then it returns the name it was constructed with", () => {
        expect(testProjection.name()).toStrictEqual("TestEntity");
      });
    });

    const eventList = [
      buildTestEvent("EventA"),
      buildTestEvent("EventB"),
      buildTestEvent("EventC"),
    ];

    describe("When I apply them", () => {
      test("Then it returns the expected state and version", () => {
        const result = testProjection.apply({
          events: eventList,
          snapshot: { state: { result: [] }, version: 0 },
        });

        expect(result.state).toStrictEqual({
          result: [
            "Applier A: I'm a test EventA",
            "Applier B: I'm a test EventB",
            "Applier C: I'm a test EventC",
          ],
        });

        expect(result.version).toStrictEqual(3);
      });
    });
  });

  describe("Given a stream carrying an event the projection never learned", () => {
    // The config's applier map is exhaustive over the event union, so this is
    // unreachable for well-typed code — which is the point of the map. It is
    // still reachable in the one way that matters in production: a stream
    // written before a new event type existed, replayed through a projection
    // that predates it. The cast stands in for that skew.
    const testProjection = new EventProjection<
      TestState,
      TestEvent,
      "CreationEvent"
    >({
      name: "TestEntity",
      creationEvent: "CreationEvent",
      appliers: {
        CreationEvent: applyCreationEvent,
        EventA: applyTestEventA,
        EventB: applyTestEventB,
        EventC: applyTestEventC,
      },
    });

    const unknown = {
      name: "EventFromTheFuture",
      version: 1,
      payload: { message: "hello" },
    } as unknown as TestEvent;

    describe("When I apply it", () => {
      test("Then it throws UNKNOWN_EVENT_APPLIER naming the event", () => {
        const error = thrownBy(() =>
          testProjection.apply({
            events: [buildTestEvent("EventA"), unknown],
            snapshot: { state: { result: [] }, version: 0 },
          }),
        );

        expect(error).toBeInstanceOf(UnknownEventApplierError);
        expect(error).toMatchObject({
          name: "UNKNOWN_EVENT_APPLIER",
          projectionName: "TestEntity",
          eventName: "EventFromTheFuture",
          eventIndex: 1,
          streamLength: 2,
        });
        expect((error as Error).message).toContain(
          "[TestEntity] Unknown event applier: EventFromTheFuture",
        );
      });
    });
  });
});
