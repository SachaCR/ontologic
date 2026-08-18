import { describe, it, expect } from "vitest";
import { DomainError } from "ontologic";

import {
  BookAlreadyDeclaredLostError,
  BookAlreadyOnLoanError,
  BookLostCannotBeLoanedError,
  BookNotFoundError,
} from "../book/errors/book.errors";
import {
  LoanAlreadyReturnedError,
  LoanNotFoundError,
  MemberActiveLoanLimitExceededError,
} from "../loan/errors/loan.errors";

/**
 * Subclassing a built-in `Error` resets the prototype chain, so without
 * `Object.setPrototypeOf` as the last constructor statement every `instanceof`
 * check below silently returns false.
 *
 * Silently is what makes it worth a test: nothing throws, the errors still
 * carry the right `name`, and matching on `.name` keeps working — so the defect
 * survives until someone reaches for `instanceof` and quietly gets the wrong
 * branch.
 */
const errors = [
  ["BookAlreadyDeclaredLostError", new BookAlreadyDeclaredLostError("book-1")],
  ["BookNotFoundError", new BookNotFoundError("book-1")],
  ["BookLostCannotBeLoanedError", new BookLostCannotBeLoanedError("book-1")],
  ["BookAlreadyOnLoanError", new BookAlreadyOnLoanError("book-1")],
  ["LoanAlreadyReturnedError", new LoanAlreadyReturnedError("loan-1")],
  [
    "MemberActiveLoanLimitExceededError",
    new MemberActiveLoanLimitExceededError("member-1"),
  ],
  ["LoanNotFoundError", new LoanNotFoundError("loan-1")],
] as const;

describe("Given a domain error raised by the library", () => {
  describe("When a caller inspects it", () => {
    it.each(errors)(
      "Then %s is still a DomainError and an Error",
      (_name, error) => {
        expect(error instanceof DomainError).toBe(true);
        expect(error instanceof Error).toBe(true);
      },
    );

    it.each(errors)("Then %s reports its own class", (_name, error) => {
      expect(error.constructor.name).toBe(_name);
    });
  });

  describe("When a caller narrows a failure by class rather than by name", () => {
    it("Then the matching class matches and the others do not", () => {
      const failure: unknown = new BookNotFoundError("book-1");

      expect(failure instanceof BookNotFoundError).toBe(true);
      expect(failure instanceof BookAlreadyOnLoanError).toBe(false);
      expect(failure instanceof LoanNotFoundError).toBe(false);
    });

    it("Then a book error is never mistaken for a loan error", () => {
      const bookFailure = new BookAlreadyDeclaredLostError("book-1");
      const loanFailure = new LoanAlreadyReturnedError("loan-1");

      expect(bookFailure instanceof BookAlreadyDeclaredLostError).toBe(true);
      expect(bookFailure instanceof LoanAlreadyReturnedError).toBe(false);
      expect(loanFailure instanceof LoanAlreadyReturnedError).toBe(true);
      expect(loanFailure instanceof BookAlreadyDeclaredLostError).toBe(false);
    });
  });
});
