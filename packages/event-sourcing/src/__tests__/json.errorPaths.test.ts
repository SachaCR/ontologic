import { describe, test, expect } from "vitest";

import { validateJsonValue } from "../json";

import { buildDeeplyInvalidObject } from "./jsonFixtures";

describe("Component validateJsonValue", () => {
  describe("Given an invalid value at the root", () => {
    describe("When I validate it", () => {
      test("Then the path is just the root", () => {
        expect(validateJsonValue(undefined)).toStrictEqual({
          isValid: false,
          code: "unsupported-type",
          reason: "undefined is dropped on serialization",
          path: "$",
        });
      });
    });
  });

  describe("Given an invalid value under an object key", () => {
    describe("When the key is a valid identifier", () => {
      test("Then the path uses dot notation", () => {
        expect(validateJsonValue({ a: { b: undefined } })).toStrictEqual({
          isValid: false,
          code: "unsupported-type",
          reason: "undefined is dropped on serialization",
          path: "$.a.b",
        });
      });
    });

    describe("When the key is not a valid identifier", () => {
      test("Then the path uses quoted bracket notation", () => {
        expect(validateJsonValue({ "not-an-id": undefined })).toStrictEqual({
          isValid: false,
          code: "unsupported-type",
          reason: "undefined is dropped on serialization",
          path: '$["not-an-id"]',
        });
      });
    });
  });

  describe("Given an invalid value inside an array", () => {
    describe("When I validate it", () => {
      test("Then the path carries the index", () => {
        expect(validateJsonValue([1, undefined])).toStrictEqual({
          isValid: false,
          code: "unsupported-type",
          reason: "undefined is dropped on serialization",
          path: "$[1]",
        });
      });
    });
  });

  describe("Given an invalid value behind a mix of keys and indexes", () => {
    describe("When I validate it", () => {
      test("Then the path interleaves both notations", () => {
        expect(
          validateJsonValue({ users: [{}, { cb: () => undefined }] }),
        ).toStrictEqual({
          isValid: false,
          code: "unsupported-type",
          reason: "a function is dropped on serialization",
          path: "$.users[1].cb",
        });
      });
    });
  });

  describe("Given an invalid value at the end of a long path", () => {
    describe("When the path is 12 segments long", () => {
      const value = buildDeeplyInvalidObject(11);

      test("Then the path is reported in full", () => {
        expect(validateJsonValue(value)).toStrictEqual({
          isValid: false,
          code: "unsupported-type",
          reason: "undefined is dropped on serialization",
          path: "$.k10.k9.k8.k7.k6.k5.k4.k3.k2.k1.k0.bad",
        });
      });
    });

    describe("When the path is one segment longer", () => {
      const value = buildDeeplyInvalidObject(12);

      // Abbreviated to the first 8 segments and the last 3, with the number of
      // elided segments in between — so both the entry point and the offending
      // leaf stay visible.
      test("Then the path is abbreviated to its head and tail", () => {
        expect(validateJsonValue(value)).toStrictEqual({
          isValid: false,
          code: "unsupported-type",
          reason: "undefined is dropped on serialization",
          path: "$.k11.k10.k9.k8.k7.k6.k5.k4 … (2 levels) … .k1.k0.bad",
        });
      });
    });

    describe("When the path is much longer", () => {
      const value = buildDeeplyInvalidObject(20);

      test("Then the head and tail stay the same size", () => {
        expect(validateJsonValue(value)).toStrictEqual({
          isValid: false,
          code: "unsupported-type",
          reason: "undefined is dropped on serialization",
          path: "$.k19.k18.k17.k16.k15.k14.k13.k12 … (10 levels) … .k1.k0.bad",
        });
      });
    });
  });
});
