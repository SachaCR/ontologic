import { Command } from "ontologic";

export interface RegisterLoanPayload {
  bookId: string;
  memberId: string;
}

export class RegisterLoanCommand extends Command<
  "REGISTER_LOAN",
  RegisterLoanPayload
> {
  constructor(payload: RegisterLoanPayload) {
    super({ name: "REGISTER_LOAN", payload });
  }
}
