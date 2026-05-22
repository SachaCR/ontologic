import { describe, it, expect } from "vitest";

import { CreditBalance } from "../creditBalance.entity";

describe("CreditBalance - balanceIsPositive invariant", () => {
  describe("fromState", () => {
    it("does not throw when subCreditBalance is positive", () => {
      const state = {
        id: "abc",
        organizationId: "org-1",
        subCreditBalance: 100,
        lockedBalance: 0,
        purchasedCreditBalance: 0,
      };

      const entity = CreditBalance.fromState("abc", 1, state);
      expect(() => entity.readState()).not.toThrow();
    });

    it("does not throw when subCreditBalance is zero", () => {
      const state = {
        id: "abc",
        organizationId: "org-1",
        subCreditBalance: 0,
        lockedBalance: 0,
        purchasedCreditBalance: 0,
      };

      const entity = CreditBalance.fromState("abc", 1, state);
      expect(() => entity.readState()).not.toThrow();
    });

    it("throws when subCreditBalance is negative", () => {
      const state = {
        id: "abc",
        organizationId: "org-1",
        subCreditBalance: -50,
        lockedBalance: 0,
        purchasedCreditBalance: 0,
      };

      const entity = CreditBalance.fromState("abc", 1, state);
      expect(() => entity.readState()).toThrow("Corrupted state detected");
    });
  });

  describe("after debit", () => {
    it("does not throw when balance remains positive after debit", () => {
      const state = {
        id: "abc",
        organizationId: "org-1",
        subCreditBalance: 100,
        lockedBalance: 0,
        purchasedCreditBalance: 0,
      };

      const entity = CreditBalance.fromState("abc", 1, state);
      entity.debit({ amount: 50 });

      expect(() => entity.readState()).not.toThrow();
      expect(entity.readState().subCreditBalance).toBe(50);
    });

    it("does not throw when debit brings balance to zero", () => {
      const state = {
        id: "abc",
        organizationId: "org-1",
        subCreditBalance: 100,
        lockedBalance: 0,
        purchasedCreditBalance: 0,
      };

      const entity = CreditBalance.fromState("abc", 1, state);
      entity.debit({ amount: 100 });

      expect(() => entity.readState()).not.toThrow();
      expect(entity.readState().subCreditBalance).toBe(0);
    });
  });

  describe("after resetSubCredit", () => {
    it("does not throw when reset to a positive value", () => {
      const state = {
        id: "abc",
        organizationId: "org-1",
        subCreditBalance: 100,
        lockedBalance: 0,
        purchasedCreditBalance: 0,
      };

      const entity = CreditBalance.fromState("abc", 1, state);
      entity.resetSubCredit({ amount: 42 });

      expect(() => entity.readState()).not.toThrow();
      expect(entity.readState().subCreditBalance).toBe(42);
    });

    it("does not throw when reset to zero", () => {
      const state = {
        id: "abc",
        organizationId: "org-1",
        subCreditBalance: 100,
        lockedBalance: 0,
        purchasedCreditBalance: 0,
      };

      const entity = CreditBalance.fromState("abc", 1, state);
      entity.resetSubCredit({ amount: 0 });

      expect(() => entity.readState()).not.toThrow();
      expect(entity.readState().subCreditBalance).toBe(0);
    });

    it("throws when reset to a negative value", () => {
      const state = {
        id: "abc",
        organizationId: "org-1",
        subCreditBalance: 100,
        lockedBalance: 0,
        purchasedCreditBalance: 0,
      };

      const entity = CreditBalance.fromState("abc", 1, state);
      entity.resetSubCredit({ amount: -10 });

      expect(() => entity.readState()).toThrow("Corrupted state detected");
    });
  });
});
