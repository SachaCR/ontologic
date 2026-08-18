import { Command } from "ontologic";

export class RecordBookReturnCommand extends Command<
  "RECORD_BOOK_RETURN",
  { loanId: string }
> {
  constructor(payload: { loanId: string }) {
    super({ name: "RECORD_BOOK_RETURN", payload });
  }
}
