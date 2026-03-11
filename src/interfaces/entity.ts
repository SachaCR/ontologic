export interface Entity<State extends object> {
  id(): string;
  state(): State;
}
