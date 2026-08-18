import { Command } from "ontologic";

export class DeclareBookLostCommand extends Command<
  "DECLARE_BOOK_LOST",
  { bookId: string }
> {
  constructor(payload: { bookId: string }) {
    super({ name: "DECLARE_BOOK_LOST", payload });
  }
}
