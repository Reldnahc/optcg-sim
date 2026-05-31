import type { createLocalDevMatch } from "./local-match.js";
import type {
  FirstPlayerChoiceState,
  MatchSessionMetadata,
} from "./session-types.js";

export const devSessionMetadata = (
  setup: Parameters<typeof createLocalDevMatch>[0],
  firstPlayerChoice?: FirstPlayerChoiceState,
): MatchSessionMetadata => ({
  matchId: setup.matchId,
  gameType: "dev",
  formatId: "dev",
  createdAt: new Date().toISOString(),
  playerIds: [...setup.playerOrder],
  creationSource: { type: "dev" },
  disconnectPolicyMode: "dev-none",
  rollbackPolicyMode: "mutual-consent",
  spectatorPolicyMode: "live-filtered",
  firstPlayerChoice: firstPlayerChoice ?? {
    source: "game-one-random-chooser",
    chooserPlayerId: setup.firstPlayerId,
    choice: "goFirst",
    resolvedFirstPlayerId: setup.firstPlayerId,
  },
});
