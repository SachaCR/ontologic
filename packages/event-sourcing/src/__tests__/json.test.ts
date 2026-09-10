import { describe, test, expect } from "vitest";
import { createContext, runInContext } from "node:vm";

import { isJsonValue, validateJsonValue } from "../json";

import { buildNestedObject } from "./jsonFixtures";

describe("Component validateJsonValue", () => {
  describe("Given a JSON primitive", () => {
    describe("When I validate a string", () => {
      test("Then it is valid", () => {
        expect(validateJsonValue("a string")).toStrictEqual({ isValid: true });
      });
    });

    describe("When I validate a finite number", () => {
      test("Then it is valid", () => {
        expect(validateJsonValue(1)).toStrictEqual({ isValid: true });
        expect(validateJsonValue(0)).toStrictEqual({ isValid: true });
        expect(validateJsonValue(-1.5)).toStrictEqual({ isValid: true });
      });
    });

    describe("When I validate a boolean", () => {
      test("Then it is valid", () => {
        expect(validateJsonValue(true)).toStrictEqual({ isValid: true });
        expect(validateJsonValue(false)).toStrictEqual({ isValid: true });
      });
    });

    describe("When I validate null", () => {
      test("Then it is valid", () => {
        expect(validateJsonValue(null)).toStrictEqual({ isValid: true });
      });
    });
  });

  describe("Given an empty container", () => {
    describe("When I validate an empty object", () => {
      test("Then it is valid", () => {
        expect(validateJsonValue({})).toStrictEqual({ isValid: true });
      });
    });

    describe("When I validate an empty array", () => {
      test("Then it is valid", () => {
        expect(validateJsonValue([])).toStrictEqual({ isValid: true });
      });
    });
  });

  describe("Given a nested structure of plain objects and arrays", () => {
    const state = {
      bookId: "b-1",
      title: "Dune",
      borrowedBy: null,
      tags: ["sci-fi", "classic"],
      copies: [{ shelf: "A1", available: true }],
    };

    describe("When I validate it", () => {
      test("Then it is valid", () => {
        expect(validateJsonValue(state)).toStrictEqual({ isValid: true });
      });
    });
  });

  describe("Given a sparse array", () => {
    const sparse: number[] = [1];
    sparse[3] = 2;

    describe("When I validate it", () => {
      // Holes come back as null, which is a JSON value, so this is accepted
      // on purpose rather than by omission.
      test("Then it is valid", () => {
        expect(validateJsonValue(sparse)).toStrictEqual({ isValid: true });
      });
    });
  });

  describe("Given a null-prototype object", () => {
    const nullPrototype = Object.assign(Object.create(null) as object, {
      a: 1,
    });

    describe("When I validate it", () => {
      // Parsing gives such an object Object.prototype back, so the round trip
      // is still faithful to its contents.
      test("Then it is valid", () => {
        expect(validateJsonValue(nullPrototype)).toStrictEqual({
          isValid: true,
        });
      });

      describe("And it is nested inside a plain object", () => {
        test("Then it is valid", () => {
          expect(validateJsonValue({ a: Object.create(null) })).toStrictEqual({
            isValid: true,
          });
        });
      });
    });
  });

  describe("Given an object whose prototype is a null-prototype object", () => {
    const twoDeep = Object.create(Object.create(null) as object) as unknown;

    describe("When I validate it", () => {
      // Its own prototype has no prototype, which is what "plain" means. It
      // carries no own keys and round-trips to `{}` faithfully.
      test("Then it is valid", () => {
        expect(validateJsonValue(twoDeep)).toStrictEqual({ isValid: true });
      });
    });
  });

  describe("Given a plain object built in another realm", () => {
    // A vm context stands in for every realm boundary that produces one of
    // these: a worker message, an iframe, and — the case that matters — a
    // host-provided `structuredClone`, whose result carries the outer realm's
    // prototype. Rejecting these made `apply` throw on its own clone.
    const context = createContext({});

    describe("When I validate it", () => {
      test("Then it is valid", () => {
        expect(
          validateJsonValue(runInContext("({ a: 1 })", context)),
        ).toStrictEqual({ isValid: true });
      });

      describe("And it is nested", () => {
        test("Then it is valid", () => {
          expect(
            validateJsonValue(runInContext("({ a: { b: [1, 2] } })", context)),
          ).toStrictEqual({ isValid: true });
        });
      });
    });

    describe("When I validate a non-plain object from that realm", () => {
      test("Then it is still rejected", () => {
        expect(
          validateJsonValue(runInContext("new Date(0)", context)),
        ).toStrictEqual({
          isValid: false,
          code: "non-plain-object",
          reason: "Date instance instead of a plain object",
          path: "$",
        });
      });
    });
  });

  describe("Given a structure that reaches the same object twice", () => {
    const shared = { a: 1 };

    describe("When I validate it", () => {
      // Two siblings pointing at one object is not a cycle: the ancestor chain
      // is unwound on the way back up, so `shared` is no longer an ancestor by
      // the time the second branch reaches it.
      test("Then it is valid", () => {
        expect(validateJsonValue({ x: shared, y: shared })).toStrictEqual({
          isValid: true,
        });
      });
    });

    describe("And the shared subtree is large enough to be memoized", () => {
      const large = {
        list: Array.from({ length: 60 }, (_unused, index) => ({ index })),
      };

      describe("When I validate it", () => {
        test("Then it is valid", () => {
          expect(validateJsonValue({ x: large, y: large })).toStrictEqual({
            isValid: true,
          });
        });
      });
    });
  });

  describe("Given a structure nested just under the depth limit", () => {
    const nested = buildNestedObject(999);

    describe("When I validate it", () => {
      test("Then it is valid", () => {
        expect(validateJsonValue(nested)).toStrictEqual({ isValid: true });
      });
    });
  });
});

describe("Component isJsonValue", () => {
  describe("Given a JSON-compatible value", () => {
    describe("When I test it", () => {
      test("Then it returns true", () => {
        expect(isJsonValue({ a: [1, "two", null] })).toStrictEqual(true);
      });
    });
  });

  describe("Given a value JSON cannot represent", () => {
    describe("When I test it", () => {
      test("Then it returns false", () => {
        expect(isJsonValue(undefined)).toStrictEqual(false);
      });
    });
  });
});
