import { describe, test, expect } from "vitest";

import { EventProjection } from "../index";

import {
  applyTestEventA,
  applyTestEventB,
  applyTestEventC,
  buildTestEvent,
  type TestEvent,
  type TestState,
} from "./testEvents";

describe("Component EventProjection", () => {
  describe("Given an event projection", () => {
    const testProjection = new EventProjection<TestState, TestEvent>(
      "TestEntity",
    );

    describe("When I read entityName", () => {
      test("Then it returns expected entity name", () => {
        expect(testProjection.entityName).toStrictEqual("TestEntity");
      });
    });
  });

  describe("Given an event projection without appliers", () => {
    const testProjection = new EventProjection<TestState, TestEvent>(
      "TestEntity",
    );

    const eventList = [buildTestEvent("EventA")];

    describe("When I apply an event", () => {
      test("Then it throws an UNKNOWN_APPLIER error", () => {
        expect(() => {
          testProjection.apply({
            events: eventList,
            snapshot: {
              state: { result: [] },
              version: 0,
            },
          });
        }).toThrow(new Error("Unknown event applier: EventA"));
      });
    });
  });

  describe("Given an event projection", () => {
    const testProjection = new EventProjection<TestState, TestEvent>(
      "TestEntity",
    );

    testProjection.mountEventApplier("EventA", applyTestEventA);
    testProjection.mountEventApplier("EventB", applyTestEventB);
    testProjection.mountEventApplier("EventC", applyTestEventC);

    const eventList = [
      buildTestEvent("EventA"),
      buildTestEvent("EventB"),
      buildTestEvent("EventC"),
    ];

    describe("When I apply them", () => {
      const result = testProjection.apply({
        events: eventList,
        snapshot: {
          state: { result: [] },
          version: 0,
        },
      });

      test("Then it return expected state", () => {
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
});
