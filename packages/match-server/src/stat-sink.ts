import type { MatchId } from "@optcg/types";

import type { UserStatOperation } from "./match-stat-extractor.js";

export interface CompletedMatchStatSinkInput {
  readonly matchId: MatchId;
  readonly operations: readonly UserStatOperation[];
}

export interface CompletedMatchStatSink {
  readonly recordCompletedMatchStats: (
    input: CompletedMatchStatSinkInput,
  ) => Promise<void>;
}
