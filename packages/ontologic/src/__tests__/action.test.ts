import { describe, it, expect } from "vitest";

import { Command, Query } from "../action";

interface LoanPayload {
  bookId: string;
  memberId: string;
  tags: string[];
}

class RegisterLoanCommand extends Command<"REGISTER_LOAN", LoanPayload> {
  constructor(payload: LoanPayload) {
    super({ name: "REGISTER_LOAN", payload });
  }
}

class FindLoanQuery extends Query<"FIND_LOAN", { memberId: string }> {
  constructor(payload: { memberId: string }) {
    super({ name: "FIND_LOAN", payload });
  }
}

describe("Command", () => {
  it("exposes its literal name and its kind", () => {
    const command = new RegisterLoanCommand({
      bookId: "book-1",
      memberId: "member-1",
      tags: ["fiction"],
    });

    expect(command.name).toBe("REGISTER_LOAN");
    expect(command.kind).toBe("command");
  });

  it("returns the payload it was built with", () => {
    const command = new RegisterLoanCommand({
      bookId: "book-1",
      memberId: "member-1",
      tags: ["fiction"],
    });

    expect(command.payload).toEqual({
      bookId: "book-1",
      memberId: "member-1",
      tags: ["fiction"],
    });
  });

  it("does not observe later mutations of the object it was built with", () => {
    const payload: LoanPayload = {
      bookId: "book-1",
      memberId: "member-1",
      tags: ["fiction"],
    };

    const command = new RegisterLoanCommand(payload);
    payload.tags.push("mutated");

    expect(command.payload.tags).toEqual(["fiction"]);
  });

  it("cannot be mutated through the payload it hands out", () => {
    const command = new RegisterLoanCommand({
      bookId: "book-1",
      memberId: "member-1",
      tags: ["fiction"],
    });

    command.payload.tags.push("mutated");

    expect(command.payload.tags).toEqual(["fiction"]);
  });

  it("serialises to its kind, name and payload", () => {
    const command = new RegisterLoanCommand({
      bookId: "book-1",
      memberId: "member-1",
      tags: [],
    });

    expect(command.toJSON()).toEqual({
      kind: "command",
      name: "REGISTER_LOAN",
      payload: { bookId: "book-1", memberId: "member-1", tags: [] },
    });
  });
});

describe("Query", () => {
  it("exposes its literal name and its kind", () => {
    const query = new FindLoanQuery({ memberId: "member-1" });

    expect(query.name).toBe("FIND_LOAN");
    expect(query.kind).toBe("query");
  });

  it("cannot be mutated through the payload it hands out", () => {
    const query = new FindLoanQuery({ memberId: "member-1" });

    query.payload.memberId = "member-2";

    expect(query.payload.memberId).toBe("member-1");
  });
});

describe("Command and Query are not interchangeable", () => {
  it("rejects a query where a command is expected, despite the identical shape", () => {
    function handle(_command: RegisterLoanCommand): void {}

    class SameShapeQuery extends Query<"REGISTER_LOAN", LoanPayload> {
      constructor(payload: LoanPayload) {
        super({ name: "REGISTER_LOAN", payload });
      }
    }

    const query = new SameShapeQuery({
      bookId: "book-1",
      memberId: "member-1",
      tags: [],
    });

    // @ts-expect-error a Query is never assignable to a Command — the private
    // fields on each class make them nominally distinct, so structural
    // equivalence is not enough. This is checked by `tsc`, not by vitest.
    handle(query);

    expect(query.kind).toBe("query");
  });
});
