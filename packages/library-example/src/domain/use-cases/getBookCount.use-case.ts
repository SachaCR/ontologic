import { Result, UseCase, ok } from "ontologic";

import { LIBRARY_STATS_ID, LibraryStatsState } from "../entities/libraryStats";
import { StatsRegister } from "../repositories/statsRegister.repository";
import { GetBookCountQuery } from "./queries/getBookCount.query";

/**
 * Reads back how many copies the library has taken in. The counting already
 * happened — `StatsReport` did it as the events arrived — so this only reports.
 */
export class GetBookCountUseCase implements UseCase<
  GetBookCountQuery,
  LibraryStatsState,
  never
> {
  constructor(private readonly statsRegister: StatsRegister) {}

  async execute(
    _query: GetBookCountQuery,
  ): Promise<Result<LibraryStatsState, never>> {
    const lookup = await this.statsRegister.getById(LIBRARY_STATS_ID);

    if (lookup.isErr()) {
      throw lookup.error;
    }

    // No row yet means nothing has been counted, which is an answer rather than
    // a failure — hence an error side of `never`.
    if (lookup.value === undefined) {
      return ok({ bookCount: 0 });
    }

    return ok(lookup.value.readState());
  }
}
