import { createHash } from "node:crypto";

import type {
  DecisionId,
  PendingDecision,
  PlayerId,
  TimerState,
} from "@optcg/types";

import { devSessionMetadata } from "./dev-session-metadata.js";
import { createLocalDevMatch, type LocalDevMatch } from "./local-match.js";
import {
  initializeLocalDevMatchTimers,
  type MatchTimerPolicy,
} from "./match-timers.js";
import type { MatchSessionService } from "./session-service.js";
import type {
  FirstPlayerChoiceState,
  FirstPlayerChoiceValue,
  MatchPersistence,
  MatchRecoveryContext,
  StoredSessionRecord,
} from "./session-types.js";
import type { LocalDevMatchSeat } from "./dev-local-match-registry.js";

export type LocalDevMatchSetup = Parameters<typeof createLocalDevMatch>[0];

export interface ActiveLocalDevMatchSession {
  status: "active";
  match: LocalDevMatch;
  seats: Record<string, LocalDevMatchSeat>;
  setup: LocalDevMatchSetup;
  firstPlayerChoice: FirstPlayerChoiceState;
  timersEnabled: boolean;
  botPlayerIds: ReadonlySet<PlayerId>;
  passiveBotPlayerIds: ReadonlySet<PlayerId>;
}

export interface PendingFirstPlayerLocalDevMatchSession {
  status: "choosingFirstPlayer";
  match: LocalDevMatch;
  setup: LocalDevMatchSetup;
  seats: Record<string, LocalDevMatchSeat>;
  firstPlayerChoice: FirstPlayerChoiceState;
  timersEnabled: boolean;
  botPlayerIds: ReadonlySet<PlayerId>;
  passiveBotPlayerIds: ReadonlySet<PlayerId>;
}

export type LocalDevMatchSession =
  | ActiveLocalDevMatchSession
  | PendingFirstPlayerLocalDevMatchSession;

export interface CreateActiveLocalDevMatchSessionOptions {
  readonly firstPlayerChoice?: FirstPlayerChoiceState;
  readonly seats?: Record<string, LocalDevMatchSeat>;
  readonly timersEnabled?: boolean;
  readonly botPlayerIds?: ReadonlySet<PlayerId>;
  readonly passiveBotPlayerIds?: ReadonlySet<PlayerId>;
  readonly initialTimers?: TimerState;
  readonly persistence?: MatchPersistence;
  readonly initialRecords?: {
    readonly actions?: readonly StoredSessionRecord[];
    readonly decisions?: readonly StoredSessionRecord[];
  };
  readonly includeActionSnapshots?: boolean;
}

export const createLocalSeats = (
  setup: LocalDevMatchSetup,
): Record<string, LocalDevMatchSeat> =>
  Object.fromEntries(
    setup.playerOrder.map((playerId): [string, LocalDevMatchSeat] => [
      playerId,
      {
        matchId: setup.matchId,
        playerId,
      },
    ]),
  );

export const activeMatchRecoveryContext = (
  session: ActiveLocalDevMatchSession,
): MatchRecoveryContext => ({
  setup: session.setup,
  seats: session.seats,
  firstPlayerChoice: session.firstPlayerChoice,
  timersEnabled: session.timersEnabled,
  botPlayerIds: [...session.botPlayerIds],
  passiveBotPlayerIds: [...session.passiveBotPlayerIds],
  rollback: session.match.rollback,
  cardVariantOverrides: session.match.cardVariantOverrides,
});

const selectedChooserForSetup = (setup: LocalDevMatchSetup): PlayerId => {
  const digest = createHash("sha256")
    .update(`${String(setup.matchId)}:${String(setup.rngSeed)}`)
    .digest();
  const index = (digest[0] ?? 0) % setup.playerOrder.length;
  return setup.playerOrder[index] ?? setup.playerOrder[0];
};

export const pendingFirstPlayerChoice = (
  setup: LocalDevMatchSetup,
  firstPlayerChoice?: FirstPlayerChoiceState,
): FirstPlayerChoiceState => ({
  ...(firstPlayerChoice ?? {
    source: "game-one-random-chooser",
    chooserPlayerId: selectedChooserForSetup(setup),
  }),
});

export const resolvedFirstPlayerId = (
  setup: LocalDevMatchSetup,
  chooserPlayerId: PlayerId,
  choice: FirstPlayerChoiceValue,
): PlayerId => {
  if (choice === "goFirst") {
    return chooserPlayerId;
  }
  return (
    setup.playerOrder.find((playerId) => playerId !== chooserPlayerId) ??
    chooserPlayerId
  );
};

const firstPlayerSetupDecision = (
  firstPlayerChoice: FirstPlayerChoiceState,
): PendingDecision => ({
  id: `decision:first-player-choice:${String(
    firstPlayerChoice.chooserPlayerId,
  )}` as DecisionId,
  type: "chooseQuantity",
  playerId: firstPlayerChoice.chooserPlayerId,
  prompt: "Choose first player.",
  causedBy: { type: "ruleProcess", name: "firstPlayerChoice" },
  visibility: { type: "public" },
  mode: "exact",
  min: 1,
  max: 1,
});

const pausedTimerState = (timers: TimerState): TimerState => ({
  players: Object.fromEntries(
    Object.entries(timers.players).map(([playerId, timer]) => [
      playerId,
      { ...timer, isRunning: false },
    ]),
  ),
  ...(timers.disconnects === undefined
    ? {}
    : {
        disconnects: Object.fromEntries(
          Object.entries(timers.disconnects).map(([playerId, timer]) => [
            playerId,
            { ...timer, isRunning: false },
          ]),
        ),
      }),
});

export const createActiveLocalDevMatchSession = (
  setup: LocalDevMatchSetup,
  sessionService: MatchSessionService,
  matchTimerPolicy: MatchTimerPolicy,
  options: CreateActiveLocalDevMatchSessionOptions = {},
): ActiveLocalDevMatchSession => {
  const timersEnabled = options.timersEnabled ?? true;
  const botPlayerIds = options.botPlayerIds ?? new Set<PlayerId>();
  const passiveBotPlayerIds =
    options.passiveBotPlayerIds ?? new Set<PlayerId>();
  const match = createLocalDevMatch(setup);
  if (timersEnabled) {
    initializeLocalDevMatchTimers(match, matchTimerPolicy);
    if (options.initialTimers !== undefined) {
      match.state = {
        ...match.state,
        timers: pausedTimerState(options.initialTimers),
      };
    }
  } else {
    match.state = { ...match.state, timers: { players: {} } };
  }
  const resolvedChoice =
    options.firstPlayerChoice ??
    ({
      source: "game-one-random-chooser",
      chooserPlayerId: setup.firstPlayerId,
      choice: "goFirst",
      resolvedFirstPlayerId: setup.firstPlayerId,
    } satisfies FirstPlayerChoiceState);
  const session: ActiveLocalDevMatchSession = {
    status: "active",
    match,
    setup,
    seats: options.seats ?? createLocalSeats(setup),
    firstPlayerChoice: resolvedChoice,
    timersEnabled,
    botPlayerIds,
    passiveBotPlayerIds,
  };
  sessionService.registerLocalDevMatch({
    local: match,
    metadata: devSessionMetadata(setup, resolvedChoice),
    ...(options.persistence === undefined
      ? {}
      : { persistence: options.persistence }),
    ...(options.initialRecords === undefined
      ? {}
      : { initialRecords: options.initialRecords }),
    recoveryContext: () => activeMatchRecoveryContext(session),
    ...(options.includeActionSnapshots === undefined
      ? {}
      : { includeActionSnapshots: options.includeActionSnapshots }),
  });
  return session;
};

export const createPendingLocalDevMatchSession = (
  setup: LocalDevMatchSetup,
  matchTimerPolicy: MatchTimerPolicy,
  firstPlayerChoice?: FirstPlayerChoiceState,
  seats?: Record<string, LocalDevMatchSeat>,
  timersEnabled = true,
  botPlayerIds: ReadonlySet<PlayerId> = new Set(),
  passiveBotPlayerIds: ReadonlySet<PlayerId> = new Set(),
): PendingFirstPlayerLocalDevMatchSession => {
  const pendingChoice = pendingFirstPlayerChoice(setup, firstPlayerChoice);
  const match = createLocalDevMatch(setup);
  if (timersEnabled) {
    initializeLocalDevMatchTimers(match, matchTimerPolicy);
  } else {
    match.state = { ...match.state, timers: { players: {} } };
  }
  match.state = {
    ...match.state,
    pendingDecision: firstPlayerSetupDecision(pendingChoice),
  };
  return {
    status: "choosingFirstPlayer",
    match,
    setup,
    seats: seats ?? createLocalSeats(setup),
    firstPlayerChoice: pendingChoice,
    timersEnabled,
    botPlayerIds,
    passiveBotPlayerIds,
  };
};
