import { describe, expectTypeOf, test } from "vitest";

import { EventProjection } from "../index";

import {
  applyCreationEvent,
  applyTestEventA,
  applyTestEventB,
  applyTestEventC,
  type CreationEvent,
  type TestEvent,
  type TestEventA,
  type TestState,
} from "./testEvents";

/**
 * Type-level tests: assertions about types rather than values.
 *
 * `tsc` is what enforces these, not vitest — `pnpm build` and
 * `pnpm typecheck` fail when one stops holding, and `vitest --typecheck` runs
 * the `expectTypeOf` half as reported tests.
 *
 * They exist because every other suite in this package builds a *correct*
 * projection, which proves valid code compiles and says nothing about whether
 * invalid code is refused. Two of the package's guarantees live entirely in
 * the type system and would otherwise have no test at all: the per-event
 * narrowing, and the exhaustiveness of the applier map.
 */

describe("Component EventProjection types", () => {
  describe("Given an applier declared for one event name", () => {
    test("Then its event is narrowed to that event, not the union", () => {
      new EventProjection<TestState, TestEvent, "CreationEvent">({
        name: "TestEntity",
        creation: { event: "CreationEvent", applier: applyCreationEvent },
        appliers: {
          EventA: ({ event, state }) => {
            expectTypeOf(event).toEqualTypeOf<TestEventA>();
            expectTypeOf(state).toEqualTypeOf<TestState>();

            // The point of the narrowing: a payload typed per event. On the
            // union this would be the union of all four payload shapes.
            expectTypeOf(event.payload).toEqualTypeOf<{ message: string }>();

            return state;
          },
          EventB: applyTestEventB,
          EventC: applyTestEventC,
        },
      });
    });
  });

  describe("Given a creation applier", () => {
    test("Then it receives the event and no incoming state", () => {
      new EventProjection<TestState, TestEvent, "CreationEvent">({
        name: "TestEntity",
        creation: {
          event: "CreationEvent",
          applier: (params) => {
            expectTypeOf(params).toEqualTypeOf<{ event: CreationEvent }>();

            return { result: [] };
          },
        },
        appliers: {
          EventA: applyTestEventA,
          EventB: applyTestEventB,
          EventC: applyTestEventC,
        },
      });
    });
  });

  describe("Given a projection", () => {
    test("Then apply returns the state and a numeric version", () => {
      expectTypeOf<
        ReturnType<EventProjection<TestState, TestEvent>["apply"]>
      >().toEqualTypeOf<{ state: TestState; version: number }>();
    });

    test("Then name returns a string", () => {
      expectTypeOf<
        ReturnType<EventProjection<TestState, TestEvent>["name"]>
      >().toEqualTypeOf<string>();
    });
  });
});

/** A stream carrying every event kind. No runtime value; types only. */
declare const wholeStream: TestEvent[];

/**
 * Every statement in here must fail to compile.
 *
 * `@ts-expect-error` is the assertion: TypeScript reports an unused directive
 * if the line below it ever starts compiling, so each one guards against the
 * types becoming *more* permissive.
 *
 * Exported and never called. Exported so `noUnusedLocals` is satisfied, never
 * called because `wholeStream` above is a declaration with no runtime value.
 */
export function negativeCases(): void {
  // ── The applier map is exhaustive ────────────────────────────────────────

  // EventC is missing. This is the guarantee the config object exists for:
  // before it, a forgotten applier was an UnknownEventApplierError the first
  // time that event turned up in a stream.
  new EventProjection<TestState, TestEvent, "CreationEvent">({
    name: "Missing",
    creation: { event: "CreationEvent", applier: applyCreationEvent },
    // @ts-expect-error
    appliers: {
      EventA: applyTestEventA,
      EventB: applyTestEventB,
    },
  });

  // The creation event is excluded from the map, so it cannot also pick up an
  // ordinary applier and end up folded twice.
  new EventProjection<TestState, TestEvent, "CreationEvent">({
    name: "Doubled",
    creation: { event: "CreationEvent", applier: applyCreationEvent },
    appliers: {
      // @ts-expect-error
      CreationEvent: applyTestEventA,
      EventA: applyTestEventA,
      EventB: applyTestEventB,
      EventC: applyTestEventC,
    },
  });

  // Without a declared creation event, every name is required — including the
  // one that would otherwise have been it.
  new EventProjection<TestState, TestEvent>({
    name: "NoCreation",
    // @ts-expect-error
    appliers: {
      EventA: applyTestEventA,
      EventB: applyTestEventB,
      EventC: applyTestEventC,
    },
  });

  // ── Appliers are matched to their event ─────────────────────────────────

  new EventProjection<TestState, TestEvent>({
    name: "Mismatched",
    appliers: {
      CreationEvent: ({ state }) => state,
      // An applier typed for EventB cannot sit under EventA's key. Without
      // `Extract`, both would take the whole union and this would compile.
      // @ts-expect-error
      EventA: applyTestEventB,
      EventB: applyTestEventB,
      EventC: applyTestEventC,
    },
  });

  new EventProjection<TestState, TestEvent>({
    name: "UnknownKey",
    appliers: {
      CreationEvent: ({ state }) => state,
      EventA: applyTestEventA,
      EventB: applyTestEventB,
      EventC: applyTestEventC,
      // @ts-expect-error
      NotAnEvent: applyTestEventA,
    },
  });

  new EventProjection<TestState, TestEvent>({
    name: "WrongReturn",
    appliers: {
      CreationEvent: ({ state }) => state,
      // @ts-expect-error
      EventA: () => ({ wrong: true }),
      EventB: applyTestEventB,
      EventC: applyTestEventC,
    },
  });

  new EventProjection<TestState, TestEvent, "CreationEvent">({
    name: "CreationWantsState",
    // A creation applier's params carry no `state` to destructure.
    // @ts-expect-error
    creation: { event: "CreationEvent", applier: ({ state }) => state },
    appliers: {
      EventA: applyTestEventA,
      EventB: applyTestEventB,
      EventC: applyTestEventC,
    },
  });

  // ── apply ───────────────────────────────────────────────────────────────

  const projection = new EventProjection<TestState, TestEvent>({
    name: "Negative",
    appliers: {
      CreationEvent: ({ state }) => state,
      EventA: applyTestEventA,
      EventB: applyTestEventB,
      EventC: applyTestEventC,
    },
  });

  // `events` is not optional: folding requires a stream, even an empty one.
  // @ts-expect-error
  projection.apply({ snapshot: { state: { result: [] }, version: 0 } });

  projection.apply({
    // @ts-expect-error
    snapshot: { state: { wrong: 1 }, version: 0 },
    events: [],
  });

  projection.apply({
    // @ts-expect-error
    snapshot: { state: { result: [] } },
    events: [],
  });

  /**
   * The guarantee the README's read-model section leans on: declare only the
   * events the model cares about and the compiler refuses the raw stream, so
   * filtering it is an obligation rather than something to remember.
   */
  const narrow = new EventProjection<TestState, TestEventA>({
    name: "Narrow",
    appliers: { EventA: applyTestEventA },
  });

  narrow.apply({
    snapshot: { state: { result: [] }, version: 0 },
    // @ts-expect-error
    events: wholeStream,
  });
}
