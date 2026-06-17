import type { MatchId, PlayerId } from "@optcg/types";

import type { AuthContext } from "./dev-auth.js";
import type { LocalDevMatch, getLocalDevSnapshot } from "./local-match.js";
import type { CompletedMatchSeatContext } from "./local-completed-match-record.js";
import type {
  ClientActionEnvelope,
  FirstPlayerChoiceState,
  FirstPlayerChoiceValue,
  SessionActionResult,
} from "./session-types.js";
import type { LocalDevMatchSetup } from "./dev-local-match-session-factory.js";

export interface CreatedDevMatchResponse {
  matchId: MatchId;
  seats: Record<string, { playerId: PlayerId; claimed: boolean }>;
  firstPlayerChoice: {
    chooserPlayerId: PlayerId;
    choices: readonly FirstPlayerChoiceValue[];
    resolvedFirstPlayerId?: PlayerId;
  };
  snapshot?: ReturnType<typeof getLocalDevSnapshot>;
}

export interface ClaimedDevSeatResponse {
  matchId: MatchId;
  seat: { playerId: PlayerId; sessionToken: string };
  firstPlayerChoice?: CreatedDevMatchResponse["firstPlayerChoice"];
}

export interface LocalDevMatchSeat extends CompletedMatchSeatContext {
  matchId: MatchId;
}

export interface TimerAdvanceBroadcast {
  matchId: MatchId;
  sync: "state" | "timers";
}

export interface LocalDevMatchRegistry {
  createMatch: (
    setup?: LocalDevMatchSetup,
    options?: {
      firstPlayerChoice?: FirstPlayerChoiceState;
      seats?: Record<string, LocalDevMatchSeat>;
      timersEnabled?: boolean;
      botPlayerIds?: readonly PlayerId[];
    },
  ) => Promise<CreatedDevMatchResponse>;
  createRematchSeed: (
    sourceMatchId: MatchId,
    playerId: PlayerId,
    auth: AuthContext | undefined,
  ) =>
    | {
        firstPlayerChoice: FirstPlayerChoiceState;
        playerOrder: readonly PlayerId[];
        seats: Record<string, Omit<LocalDevMatchSeat, "matchId">>;
        botPlayerIds: readonly PlayerId[];
      }
    | "matchNotFound"
    | "unauthenticated"
    | "forbidden"
    | "sourceNotCompleted"
    | "noPreviousLoser";
  resetMatch: (
    matchId: MatchId,
    setup?: LocalDevMatchSetup,
  ) => Promise<CreatedDevMatchResponse>;
  claimSeat: (
    matchId: MatchId,
    playerId: PlayerId,
    auth: AuthContext | undefined,
  ) => Promise<
    | ClaimedDevSeatResponse
    | "matchNotFound"
    | "seatNotFound"
    | "unauthenticated"
    | "claimed"
  >;
  claimSeatForAuth: (
    matchId: MatchId,
    auth: AuthContext | undefined,
  ) => Promise<
    | ClaimedDevSeatResponse
    | "matchNotFound"
    | "seatNotFound"
    | "unauthenticated"
  >;
  getMatch: (matchId: MatchId) => LocalDevMatch | undefined;
  chooseFirstPlayer: (
    matchId: MatchId,
    playerId: PlayerId,
    choice: FirstPlayerChoiceValue,
  ) => Promise<
    CreatedDevMatchResponse | "matchNotFound" | "alreadyStarted" | "notChooser"
  >;
  getFirstPlayerChoice: (
    matchId: MatchId,
  ) => CreatedDevMatchResponse["firstPlayerChoice"] | undefined;
  virtualConnectedPlayerIds: (matchId: MatchId) => ReadonlySet<PlayerId>;
  applyEnvelope: (
    envelope: ClientActionEnvelope,
  ) => Promise<SessionActionResult | "matchNotFound">;
  advanceTimers: (input: {
    readonly elapsedMs: number;
    readonly connectedPlayerIds: (matchId: MatchId) => ReadonlySet<PlayerId>;
    readonly matchIds?: readonly MatchId[];
  }) => Promise<readonly TimerAdvanceBroadcast[]>;
  authorizeSeat: (
    auth: AuthContext | undefined,
    matchId: MatchId,
    playerId: PlayerId,
  ) => "authorized" | "unauthenticated" | "forbidden";
  defaultMatchId: MatchId;
}
