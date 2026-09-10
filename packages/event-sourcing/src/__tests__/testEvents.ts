import type { SourceEvent } from "../interfaces";

export interface CreationEvent extends SourceEvent {
  name: "CreationEvent";
  payload: {
    message: string;
  };
}

export interface TestEventA extends SourceEvent {
  name: "EventA";
  payload: {
    message: string;
  };
}

export interface TestEventB extends SourceEvent {
  name: "EventB";
  payload: {
    message: string;
  };
}

export interface TestEventC extends SourceEvent {
  name: "EventC";
  payload: {
    message: string;
  };
}

export type TestEvent = CreationEvent | TestEventA | TestEventB | TestEventC;

export interface TestState {
  result: string[];
}

export function applyCreationEvent(params: {
  event: CreationEvent;
}): TestState {
  const { event } = params;
  return {
    result: ["Creation Event: " + event.payload.message],
  };
}

export function applyTestEventA(params: {
  state: TestState;
  event: TestEventA;
}): TestState {
  const { state, event } = params;

  return {
    result: state.result.concat("Applier A: " + event.payload.message),
  };
}

export function applyTestEventB(params: {
  state: TestState;
  event: TestEventB;
}): TestState {
  const { state, event } = params;
  return {
    result: state.result.concat("Applier B: " + event.payload.message),
  };
}

export function applyTestEventC(params: {
  state: TestState;
  event: TestEventC;
}): TestState {
  const { state, event } = params;
  return {
    result: state.result.concat("Applier C: " + event.payload.message),
  };
}

export function buildTestEvent(name: TestEvent["name"]): TestEvent {
  const event: TestEvent = {
    name,
    payload: {
      message: `I'm a test ${name}`,
    },
    version: 1,
  };

  return event;
}

/**
 * Runs `fn` and returns whatever it threw, so a test can assert on a typed
 * error's fields and not only on its message. Fails loudly if nothing throws —
 * a silent pass is the failure mode of hand-rolled try/catch assertions.
 */
export function thrownBy(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }

  throw new Error("Expected the call to throw, but it returned normally");
}
