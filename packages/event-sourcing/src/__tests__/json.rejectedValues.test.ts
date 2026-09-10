import { describe, test, expect } from "vitest";

import { validateJsonValue } from "../json";

import { buildNestedObject } from "./jsonFixtures";

describe("Component validateJsonValue", () => {
  describe("Given a value of a type JSON cannot represent", () => {
    describe("When I validate undefined", () => {
      test("Then it is rejected as unsupported-type", () => {
        expect(validateJsonValue(undefined)).toStrictEqual({
          isValid: false,
          code: "unsupported-type",
          reason: "undefined is dropped on serialization",
          path: "$",
        });
      });
    });

    describe("When I validate a function", () => {
      test("Then it is rejected as unsupported-type", () => {
        expect(validateJsonValue(() => undefined)).toStrictEqual({
          isValid: false,
          code: "unsupported-type",
          reason: "a function is dropped on serialization",
          path: "$",
        });
      });
    });

    describe("When I validate a symbol", () => {
      test("Then it is rejected as unsupported-type", () => {
        expect(validateJsonValue(Symbol("a symbol"))).toStrictEqual({
          isValid: false,
          code: "unsupported-type",
          reason: "a symbol is dropped on serialization",
          path: "$",
        });
      });
    });

    describe("When I validate a bigint", () => {
      test("Then it is rejected as unsupported-type", () => {
        expect(validateJsonValue(10n)).toStrictEqual({
          isValid: false,
          code: "unsupported-type",
          reason: "a bigint makes JSON.stringify throw",
          path: "$",
        });
      });
    });
  });

  describe("Given a non-finite number", () => {
    describe("When I validate NaN", () => {
      test("Then it is rejected as non-finite-number", () => {
        expect(validateJsonValue(NaN)).toStrictEqual({
          isValid: false,
          code: "non-finite-number",
          reason: "NaN would be serialized as null",
          path: "$",
        });
      });
    });

    describe("When I validate Infinity", () => {
      test("Then it is rejected as non-finite-number", () => {
        expect(validateJsonValue(Infinity)).toStrictEqual({
          isValid: false,
          code: "non-finite-number",
          reason: "Infinity would be serialized as null",
          path: "$",
        });
      });
    });

    describe("When I validate -Infinity", () => {
      test("Then it is rejected as non-finite-number", () => {
        expect(validateJsonValue(-Infinity)).toStrictEqual({
          isValid: false,
          code: "non-finite-number",
          reason: "-Infinity would be serialized as null",
          path: "$",
        });
      });
    });
  });

  describe("Given an object that is not a plain object", () => {
    describe("When I validate a Date", () => {
      test("Then it is rejected as non-plain-object", () => {
        expect(validateJsonValue(new Date(0))).toStrictEqual({
          isValid: false,
          code: "non-plain-object",
          reason: "Date instance instead of a plain object",
          path: "$",
        });
      });
    });

    describe("When I validate a Map", () => {
      test("Then it is rejected as non-plain-object", () => {
        expect(validateJsonValue(new Map())).toStrictEqual({
          isValid: false,
          code: "non-plain-object",
          reason: "Map instance instead of a plain object",
          path: "$",
        });
      });
    });

    describe("When I validate a Set", () => {
      test("Then it is rejected as non-plain-object", () => {
        expect(validateJsonValue(new Set())).toStrictEqual({
          isValid: false,
          code: "non-plain-object",
          reason: "Set instance instead of a plain object",
          path: "$",
        });
      });
    });

    describe("When I validate a RegExp", () => {
      test("Then it is rejected as non-plain-object", () => {
        expect(validateJsonValue(/a-pattern/)).toStrictEqual({
          isValid: false,
          code: "non-plain-object",
          reason: "RegExp instance instead of a plain object",
          path: "$",
        });
      });
    });

    describe("When I validate a class instance", () => {
      class Point {
        x = 1;
      }

      test("Then it is rejected and named after its constructor", () => {
        expect(validateJsonValue(new Point())).toStrictEqual({
          isValid: false,
          code: "non-plain-object",
          reason: "Point instance instead of a plain object",
          path: "$",
        });
      });
    });

    describe("When I validate an object whose constructor cannot be named", () => {
      // Three prototypes deep: the chain reaches a null-prototype object only
      // at the third hop, so this is not a plain object in any realm — and
      // there is no constructor anywhere on the chain to name it after.
      const unnameable = Object.create(
        Object.create(Object.create(null) as object) as object,
      ) as unknown;

      test("Then it is rejected with a placeholder name", () => {
        expect(validateJsonValue(unnameable)).toStrictEqual({
          isValid: false,
          code: "non-plain-object",
          reason: "? instance instead of a plain object",
          path: "$",
        });
      });
    });
  });

  describe("Given an object with a symbol key", () => {
    describe("When I validate it", () => {
      test("Then it is rejected as symbol-key", () => {
        expect(validateJsonValue({ [Symbol("tag")]: 1 })).toStrictEqual({
          isValid: false,
          code: "symbol-key",
          reason: "key Symbol(tag) is dropped on serialization",
          path: "$",
        });
      });
    });

    describe("And the object is an array", () => {
      const arrayWithSymbolKey: unknown[] = [1];
      Object.defineProperty(arrayWithSymbolKey, Symbol("tag"), { value: 2 });

      describe("When I validate it", () => {
        // The symbol check runs before the array walk, so the failure is
        // reported on the array itself rather than on one of its items.
        test("Then it is rejected as symbol-key at the array", () => {
          expect(validateJsonValue(arrayWithSymbolKey)).toStrictEqual({
            isValid: false,
            code: "symbol-key",
            reason: "key Symbol(tag) is dropped on serialization",
            path: "$",
          });
        });
      });
    });
  });

  describe("Given a circular structure", () => {
    describe("When I validate an object that references itself", () => {
      const selfReferencing: Record<string, unknown> = {};
      selfReferencing["self"] = selfReferencing;

      test("Then it is rejected as circular-reference", () => {
        expect(validateJsonValue(selfReferencing)).toStrictEqual({
          isValid: false,
          code: "circular-reference",
          reason: "circular reference",
          path: "$.self",
        });
      });
    });

    describe("When I validate an array that references itself", () => {
      const selfReferencing: unknown[] = [];
      selfReferencing.push(selfReferencing);

      test("Then it is rejected as circular-reference", () => {
        expect(validateJsonValue(selfReferencing)).toStrictEqual({
          isValid: false,
          code: "circular-reference",
          reason: "circular reference",
          path: "$[0]",
        });
      });
    });

    describe("When I validate a cycle that closes further down", () => {
      const root: Record<string, unknown> = { a: { b: {} } };
      const a = root["a"] as Record<string, unknown>;
      const b = a["b"] as Record<string, unknown>;
      b["back"] = root;

      test("Then it is rejected at the edge that closes the cycle", () => {
        expect(validateJsonValue(root)).toStrictEqual({
          isValid: false,
          code: "circular-reference",
          reason: "circular reference",
          path: "$.a.b.back",
        });
      });
    });
  });

  describe("Given a structure nested past the depth limit", () => {
    const nested = buildNestedObject(1000);

    describe("When I validate it", () => {
      // Capped deliberately: the walk is recursive, and without the cap an
      // over-deep structure throws a RangeError instead of returning a result.
      test("Then it is rejected as max-depth-exceeded", () => {
        expect(validateJsonValue(nested)).toStrictEqual({
          isValid: false,
          code: "max-depth-exceeded",
          reason: "nested deeper than 1000 levels",
          path: "$.n.n.n.n.n.n.n.n … (989 levels) … .n.n.n",
        });
      });
    });
  });
});
