import { describe, test, expect } from "vitest";

import { EventProjection } from "../index";

import {
  applyCreationEvent,
  applyTestEventA,
  applyTestEventB,
  applyTestEventC,
  buildTestEvent,
  type TestEvent,
  type TestState,
} from "./testEvents";

describe("Component EventProjection", () => {
  describe("Given an event projection without creation event applier", () => {
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

    describe("When I apply events without initial state", () => {
      test("Then it throws an error 'No creation event applier configured'", () => {
        expect(() => {
          testProjection.apply({
            events: eventList,
          });
        }).toThrow(new Error("No creation event applier configured"));
      });
    });
  });

  describe("Given an event projection with creation event applier", () => {
    const testProjection = new EventProjection<TestState, TestEvent>(
      "TestEntity",
    );

    testProjection.mountCreationEventApplier(
      "CreationEvent",
      applyCreationEvent,
    );

    testProjection.mountEventApplier("EventA", applyTestEventA);
    testProjection.mountEventApplier("EventB", applyTestEventB);
    testProjection.mountEventApplier("EventC", applyTestEventC);

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

        test("Then it throws an error 'Initial event not found'", () => {
          let error: Error | undefined;

          try {
            testProjection.apply({
              events: eventList,
            });
          } catch (err) {
            if (err instanceof Error) {
              error = err;
            }
          }

          if (!error) {
            throw new Error("Expected an error to be thrown");
          }

          expect(error).toBeDefined();
          expect(error).toBeInstanceOf(Error);
          expect(error.message).toStrictEqual("Initial event not found");
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

        test("Then it throws an error 'Unknown event applier'", () => {
          expect(() => {
            testProjection.apply({
              snapshot: {
                state: initialState,
                version: 587,
              },
              events: eventList,
            });
          }).toThrow(new Error("Unknown event applier: CreationEvent"));
        });
      });
    });
  });
});
