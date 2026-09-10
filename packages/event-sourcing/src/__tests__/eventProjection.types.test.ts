import { describe, expectTypeOf, test } from "vitest";

import { EventProjection } from "../index";

import {
  applyTestEventA,
  applyTestEventB,
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
 * They exist because every other suite in this package mounts a *correct*
 * applier, which proves valid code compiles and says nothing about whether
 * invalid code is refused. The per-event narrowing is the package's headline
 * feature and could be loosened to accept anything without a single runtime
 * test noticing.
 */

describe("Component EventProjection types", () => {
  describe("Given an applier mounted for one event name", () => {
    const projection = new EventProjection<TestState, TestEvent>("TestEntity");

    test("Then its event is narrowed to that event, not the union", () => {
      projection.mountEventApplier("EventA", ({ event, state }) => {
        expectTypeOf(event).toEqualTypeOf<TestEventA>();
        expectTypeOf(state).toEqualTypeOf<TestState>();

        // The point of the narrowing: a payload typed per event. On the union
        // this would be the union of all four payload shapes.
        expectTypeOf(event.payload).toEqualTypeOf<{ message: string }>();

        return state;
      });
    });
  });

  describe("Given a creation event applier", () => {
    const projection = new EventProjection<TestState, TestEvent>("TestEntity");

    test("Then it receives the event and no incoming state", () => {
      projection.mountCreationEventApplier("CreationEvent", (params) => {
        expectTypeOf(params).toEqualTypeOf<{ event: CreationEvent }>();

        return { result: [] };
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
 * if the line below it ever starts compiling, so each one is a guard against
 * the types becoming *more* permissive.
 *
 * Exported and never called. Exported so `noUnusedLocals` is satisfied, never
 * called because `wholeStream` above is a declaration with no runtime value.
 */
export function negativeCases(): void {
  const projection = new EventProjection<TestState, TestEvent>("Negative");

  // An applier typed for one event cannot be mounted under another's name.
  // This is the assertion that the narrowing actually narrows: without
  // `Extract`, both appliers would take the whole union and this would compile.
  // @ts-expect-error
  projection.mountEventApplier("EventA", applyTestEventB);

  // An event name outside the declared union is not mountable.
  // @ts-expect-error
  projection.mountEventApplier("NotAnEvent", applyTestEventA);

  // Nor as a creation event.
  // @ts-expect-error
  projection.mountCreationEventApplier("NotAnEvent", () => ({ result: [] }));

  // A creation applier's params carry no `state` to destructure.
  // @ts-expect-error
  projection.mountCreationEventApplier("CreationEvent", ({ state }) => state);

  // An applier has to return the projection's State.
  // @ts-expect-error
  projection.mountEventApplier("EventA", () => ({ wrong: true }));

  // `events` is not optional: folding requires a stream, even an empty one.
  // @ts-expect-error
  projection.apply({ snapshot: { state: { result: [] }, version: 0 } });

  // A snapshot's state has to be the projection's State.
  projection.apply({
    // @ts-expect-error
    snapshot: { state: { wrong: 1 }, version: 0 },
    events: [],
  });

  // A version is not optional either.
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
  const narrow = new EventProjection<TestState, TestEventA>("Narrow");

  narrow.apply({
    snapshot: { state: { result: [] }, version: 0 },
    // @ts-expect-error
    events: wholeStream,
  });
}
