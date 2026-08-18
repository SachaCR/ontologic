import { Command } from "ontologic";

export interface AddBookPayload {
  title: string;
  author: string;
  isbn: string;
  category: string;
  tags: string[];
}

export class AddBookCommand extends Command<"ADD_BOOK", AddBookPayload> {
  constructor(payload: AddBookPayload) {
    super({ name: "ADD_BOOK", payload });
  }
}
