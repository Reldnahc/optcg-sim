import { createHash, randomUUID } from "node:crypto";

import type {
  DecisionId,
  MatchId,
  PendingDecision,
  PlayerId,
  TimerState,
} from "@optcg/types";

import {
  buildLocalCompletedMatchRecord,
  type CompletedMatchSeatContext,
} from "./local-completed-match-record.js";
import { devSessionMetadata } from "./dev-session-metadata.js";
import { createDevUserSessionToken, type AuthContext } from "./dev-auth.js";
import { subjectsMatch, subjectsOwnSameAccount } from "./dev-auth.js";
import {
  createLocalDevMatch,
  getLocalDevSnapshot,
  setLocalDevMatchPlayerLabels,
  type LocalDevMatch,
} from "./local-match.js";
import {
  advanceLocalDevMatchTimers,
  applyLocalDevMatchTimerExpiries,
  defaultMatchTimerPolicy,
  initializeLocalDevMatchTimers,
  type MatchTimerPolicy,
} from "./match-timers.js";
import {
  createMatchSessionService,
  type MatchSessionService,
} from "./session-service.js";
import {
  recordActionTimingSpan,
  recordActionTimingSpanAsync,
} from "./action-timing-log.js";
import type {
  ClientActionEnvelope,
  FirstPlayerChoiceState,
  FirstPlayerChoiceValue,
  SessionActionRequest,
  SessionActionResult,
} from "./session-types.js";
import type { CompletedMatchRepository } from "./postgres-completed-match.js";
import { defaultBotStrategy, type BotStrategy } from "./bot-player.js";
import { requestHash } from "./action-envelope.js";

type LocalDevMatchSetup = Parameters<typeof createLocalDevMatch>[0];

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

interface ActiveLocalDevMatchSession {
  status: "active";
  match: LocalDevMatch;
  seats: Record<string, LocalDevMatchSeat>;
  setup: LocalDevMatchSetup;
  firstPlayerChoice: FirstPlayerChoiceState;
  timersEnabled: boolean;
  botPlayerIds: ReadonlySet<PlayerId>;
}

interface PendingFirstPlayerLocalDevMatchSession {
  status: "choosingFirstPlayer";
  match: LocalDevMatch;
  setup: LocalDevMatchSetup;
  seats: Record<string, LocalDevMatchSeat>;
  firstPlayerChoice: FirstPlayerChoiceState;
  timersEnabled: boolean;
  botPlayerIds: ReadonlySet<PlayerId>;
}

type LocalDevMatchSession =
  | ActiveLocalDevMatchSession
  | PendingFirstPlayerLocalDevMatchSession;

interface CreateActiveLocalDevMatchSessionOptions {
  readonly firstPlayerChoice?: FirstPlayerChoiceState;
  readonly timersEnabled?: boolean;
  readonly botPlayerIds?: ReadonlySet<PlayerId>;
  readonly initialTimers?: TimerState;
  readonly includeActionSnapshots?: boolean;
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
  ) =>
    | ClaimedDevSeatResponse
    | "matchNotFound"
    | "seatNotFound"
    | "unauthenticated"
    | "claimed";
  claimSeatForAuth: (
    matchId: MatchId,
    auth: AuthContext | undefined,
  ) =>
    | ClaimedDevSeatResponse
    | "matchNotFound"
    | "seatNotFound"
    | "unauthenticated";
  getMatch: (matchId: MatchId) => LocalDevMatch | undefined;
  chooseFirstPlayer: (
    matchId: MatchId,
    playerId: PlayerId,
    choice: FirstPlayerChoiceValue,
  ) =>
    | CreatedDevMatchResponse
    | "matchNotFound"
    | "alreadyStarted"
    | "notChooser";
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
  }) => readonly TimerAdvanceBroadcast[];
  authorizeSeat: (
    auth: AuthContext | undefined,
    matchId: MatchId,
    playerId: PlayerId,
  ) => "authorized" | "unauthenticated" | "forbidden";
  defaultMatchId: MatchId;
}

const createLocalSeats = (
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

const firstPlayerChoiceResponse = (
  firstPlayerChoice: FirstPlayerChoiceState,
): CreatedDevMatchResponse["firstPlayerChoice"] => ({
  chooserPlayerId: firstPlayerChoice.chooserPlayerId,
  choices: ["goFirst", "goSecond"],
  ...(firstPlayerChoice.resolvedFirstPlayerId === undefined
    ? {}
    : { resolvedFirstPlayerId: firstPlayerChoice.resolvedFirstPlayerId }),
});

const selectedChooserForSetup = (setup: LocalDevMatchSetup): PlayerId => {
  const digest = createHash("sha256")
    .update(`${String(setup.matchId)}:${String(setup.rngSeed)}`)
    .digest();
  const index = (digest[0] ?? 0) % setup.playerOrder.length;
  return setup.playerOrder[index] ?? setup.playerOrder[0];
};

const pendingFirstPlayerChoice = (
  setup: LocalDevMatchSetup,
  firstPlayerChoice?: FirstPlayerChoiceState,
): FirstPlayerChoiceState => ({
  ...(firstPlayerChoice ?? {
    source: "game-one-random-chooser",
    chooserPlayerId: selectedChooserForSetup(setup),
  }),
});

const resolvedFirstPlayerId = (
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

const connectedPlayerIdsWithBots = (
  connectedPlayerIds: ReadonlySet<PlayerId>,
  botPlayerIds: ReadonlySet<PlayerId>,
): ReadonlySet<PlayerId> => {
  if (botPlayerIds.size === 0) {
    return connectedPlayerIds;
  }
  return new Set([...connectedPlayerIds, ...botPlayerIds]);
};

const createActiveLocalDevMatchSession = (
  setup: LocalDevMatchSetup,
  sessionService: MatchSessionService,
  matchTimerPolicy: MatchTimerPolicy,
  options: CreateActiveLocalDevMatchSessionOptions = {},
): ActiveLocalDevMatchSession => {
  const timersEnabled = options.timersEnabled ?? true;
  const botPlayerIds = options.botPlayerIds ?? new Set<PlayerId>();
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
  sessionService.registerLocalDevMatch({
    local: match,
    metadata: devSessionMetadata(setup, resolvedChoice),
    ...(options.includeActionSnapshots === undefined
      ? {}
      : { includeActionSnapshots: options.includeActionSnapshots }),
  });
  return {
    status: "active",
    match,
    setup,
    seats: createLocalSeats(setup),
    firstPlayerChoice: resolvedChoice,
    timersEnabled,
    botPlayerIds,
  };
};

const createPendingLocalDevMatchSession = (
  setup: LocalDevMatchSetup,
  matchTimerPolicy: MatchTimerPolicy,
  firstPlayerChoice?: FirstPlayerChoiceState,
  seats?: Record<string, LocalDevMatchSeat>,
  timersEnabled = true,
  botPlayerIds: ReadonlySet<PlayerId> = new Set(),
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
  };
};

const createdSeatResponse = (
  seats: Record<string, LocalDevMatchSeat>,
): CreatedDevMatchResponse["seats"] =>
  Object.fromEntries(
    Object.entries(seats).map(([key, seat]) => [
      key,
      {
        playerId: seat.playerId,
        claimed: seat.subject !== undefined,
      },
    ]),
  );

const playerLabelsFromSeats = (
  seats: Record<string, LocalDevMatchSeat>,
  virtualConnectedPlayerIds: ReadonlySet<PlayerId> = new Set(),
): ReturnType<typeof getLocalDevSnapshot>["playerLabels"] => {
  const labels = Object.fromEntries(
    Object.values(seats).flatMap((seat) => {
      const displayName = seat.subject?.displayName?.trim();
      const connectionStatus = virtualConnectedPlayerIds.has(seat.playerId)
        ? "connected"
        : undefined;
      return (displayName === undefined || displayName.length === 0) &&
        connectionStatus === undefined
        ? []
        : [[seat.playerId, { displayName, connectionStatus }] as const];
    }),
  ) as ReturnType<typeof getLocalDevSnapshot>["playerLabels"];
  return labels === undefined || Object.keys(labels).length === 0
    ? undefined
    : labels;
};

const syncActiveSessionPlayerLabels = (session: LocalDevMatchSession): void => {
  if (session.status !== "active") {
    return;
  }
  setLocalDevMatchPlayerLabels(
    session.match,
    playerLabelsFromSeats(session.seats, session.botPlayerIds),
  );
};

const refreshSeatSubject = (
  seat: LocalDevMatchSeat,
  subject: AuthContext["subject"],
): void => {
  seat.subject = {
    ...seat.subject,
    ...subject,
    ...(subject.displayName === undefined
      ? {}
      : { displayName: subject.displayName }),
  };
};

export const matchSeatsWithMatchId = (
  sourceSeats: Record<string, Omit<LocalDevMatchSeat, "matchId">>,
  matchId: MatchId,
): Record<string, LocalDevMatchSeat> =>
  Object.fromEntries(
    Object.entries(sourceSeats).map(([key, seat]) => [
      key,
      {
        matchId,
        playerId: seat.playerId,
        ...(seat.subject === undefined
          ? {}
          : { subject: structuredClone(seat.subject) }),
        ...(seat.deckSubmission === undefined
          ? {}
          : { deckSubmission: structuredClone(seat.deckSubmission) }),
        ...(seat.verifiedHandoff === undefined
          ? {}
          : { verifiedHandoff: structuredClone(seat.verifiedHandoff) }),
      },
    ]),
  );

const rematchSeatsFromSource = (
  sourceSeats: Record<string, LocalDevMatchSeat>,
): Record<string, Omit<LocalDevMatchSeat, "matchId">> =>
  Object.fromEntries(
    Object.entries(sourceSeats).map(([key, seat]) => [
      key,
      {
        playerId: seat.playerId,
        ...(seat.subject === undefined
          ? {}
          : { subject: structuredClone(seat.subject) }),
        ...(seat.deckSubmission === undefined
          ? {}
          : { deckSubmission: structuredClone(seat.deckSubmission) }),
        ...(seat.verifiedHandoff === undefined
          ? {}
          : { verifiedHandoff: structuredClone(seat.verifiedHandoff) }),
      },
    ]),
  );

const previousLoserId = (
  session: ActiveLocalDevMatchSession,
): PlayerId | undefined => {
  const status = session.match.state.status;
  if (status.type !== "completed" && status.type !== "gameOver") {
    return undefined;
  }
  if (status.winner === "draw") {
    return undefined;
  }
  return session.setup.playerOrder.find(
    (playerId) => playerId !== status.winner,
  );
};

export const createLocalDevMatchRegistry = async (
  createDefaultSetup: (matchId?: MatchId) => Promise<LocalDevMatchSetup>,
  initialSetup?: LocalDevMatchSetup,
  options: {
    readonly botActionDelayMs?: number;
    readonly createDefaultMatch?: boolean;
    readonly completedMatchRepository?: CompletedMatchRepository;
    readonly includeActionSnapshots?: boolean;
    readonly matchTimerPolicy?: MatchTimerPolicy;
    readonly onBotActionAccepted?: (matchId: MatchId) => void;
    readonly botStrategy?: BotStrategy;
  } = {},
): Promise<LocalDevMatchRegistry> => {
  let nextMatchNumber = 1;
  const sessions = new Map<MatchId, LocalDevMatchSession>();
  const completedPersistedMatchIds = new Set<MatchId>();
  const activeBotRuns = new Set<MatchId>();
  const sessionService = createMatchSessionService();
  const matchTimerPolicy = options.matchTimerPolicy ?? defaultMatchTimerPolicy;
  const botStrategy = options.botStrategy ?? defaultBotStrategy;
  const botActionDelayMs = options.botActionDelayMs ?? 1_000;
  const includeActionSnapshots = options.includeActionSnapshots;
  const activeSessionSnapshotOptions =
    includeActionSnapshots === undefined ? {} : { includeActionSnapshots };
  const waitForBotActionDelay = async (): Promise<void> => {
    if (botActionDelayMs <= 0) {
      return;
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, botActionDelayMs);
    });
  };
  const createTemplateSetup = async (
    matchId: MatchId,
  ): Promise<LocalDevMatchSetup> => {
    if (initialSetup === undefined) {
      return createDefaultSetup(matchId);
    }
    return {
      ...structuredClone(initialSetup),
      matchId,
    };
  };
  const defaultMatchId = "dev-local-match" as MatchId;
  if (options.createDefaultMatch !== false) {
    const defaultSetup = await createTemplateSetup(defaultMatchId);
    sessions.set(
      defaultSetup.matchId,
      createActiveLocalDevMatchSession(
        defaultSetup,
        sessionService,
        matchTimerPolicy,
        activeSessionSnapshotOptions,
      ),
    );
  }

  const buildCreatedResponse = (
    setup: LocalDevMatchSetup,
    session: LocalDevMatchSession,
  ): CreatedDevMatchResponse => {
    syncActiveSessionPlayerLabels(session);
    return {
      matchId: setup.matchId,
      seats: createdSeatResponse(session.seats),
      firstPlayerChoice: firstPlayerChoiceResponse(session.firstPlayerChoice),
      ...(session.status === "active"
        ? { snapshot: getLocalDevSnapshot(session.match) }
        : {}),
    };
  };

  const persistCompletedMatchIfNeeded = async (
    session: ActiveLocalDevMatchSession,
  ): Promise<void> => {
    const completedMatchRepository = options.completedMatchRepository;
    if (
      completedMatchRepository === undefined ||
      completedPersistedMatchIds.has(session.match.state.matchId)
    ) {
      return;
    }
    const record = recordActionTimingSpan("completedMatchRecordBuild", () =>
      buildLocalCompletedMatchRecord({
        match: session.match,
        setup: session.setup,
        seats: session.seats,
        firstPlayerChoice: session.firstPlayerChoice,
        records:
          sessionService.getRuntime(session.match.state.matchId)?.records() ??
          [],
        endedAt: new Date().toISOString(),
      }),
    );
    if (record === undefined) {
      return;
    }
    await recordActionTimingSpanAsync("completedMatchSave", async () => {
      await completedMatchRepository.saveCompletedMatch(record);
    });
    completedPersistedMatchIds.add(session.match.state.matchId);
  };

  const botRequestFromChoice = (
    botPlayerId: PlayerId,
    snapshot: ReturnType<typeof getLocalDevSnapshot>,
  ): SessionActionRequest | undefined => {
    const choice = botStrategy.chooseAction({ snapshot, botPlayerId });
    if (choice === undefined) {
      return undefined;
    }
    return choice.type === "submitAction"
      ? {
          type: "submitAction",
          playerId: botPlayerId,
          actionIndex: choice.actionIndex,
          expectedStateSeq: snapshot.stateSeq,
        }
      : {
          type: "respondToDecision",
          playerId: botPlayerId,
          decisionId: choice.decisionId,
          response: choice.response,
        };
  };

  const runBotActions = async (
    session: ActiveLocalDevMatchSession,
  ): Promise<void> => {
    if (session.botPlayerIds.size === 0) {
      return;
    }
    const matchId = session.match.state.matchId;
    if (activeBotRuns.has(matchId)) {
      return;
    }
    activeBotRuns.add(matchId);
    try {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        let acceptedAction = false;
        for (const botPlayerId of session.botPlayerIds) {
          await waitForBotActionDelay();
          const snapshot = getLocalDevSnapshot(session.match);
          const request = botRequestFromChoice(botPlayerId, snapshot);
          if (request === undefined) {
            continue;
          }
          const result = sessionService.applyEnvelope({
            protocolVersion: "dev",
            matchId,
            playerId: botPlayerId,
            clientActionId: `bot:${randomUUID()}`,
            expectedStateSeq: snapshot.stateSeq,
            ...(request.type !== "respondToDecision"
              ? {}
              : { expectedDecisionId: request.decisionId }),
            requestHash: requestHash(request),
            request,
          });
          if (!result.accepted) {
            continue;
          }
          acceptedAction = true;
          await persistCompletedMatchIfNeeded(session);
          options.onBotActionAccepted?.(matchId);
        }
        if (!acceptedAction) {
          return;
        }
      }
    } finally {
      activeBotRuns.delete(matchId);
    }
  };

  const scheduleBotActions = (session: ActiveLocalDevMatchSession): void => {
    void runBotActions(session);
  };

  return {
    defaultMatchId,
    async createMatch(setup, options) {
      const actualSetup =
        setup ??
        (await createTemplateSetup(
          `dev-local-match-${String(nextMatchNumber++)}` as MatchId,
        ));
      const botPlayerIds = new Set(options?.botPlayerIds ?? []);
      const session =
        options?.firstPlayerChoice?.resolvedFirstPlayerId === undefined
          ? createPendingLocalDevMatchSession(
              actualSetup,
              matchTimerPolicy,
              options?.firstPlayerChoice,
              options?.seats,
              options?.timersEnabled,
              botPlayerIds,
            )
          : {
              ...createActiveLocalDevMatchSession(
                {
                  ...actualSetup,
                  firstPlayerId:
                    options.firstPlayerChoice.resolvedFirstPlayerId,
                },
                sessionService,
                matchTimerPolicy,
                {
                  ...activeSessionSnapshotOptions,
                  firstPlayerChoice: options.firstPlayerChoice,
                  ...(options.timersEnabled === undefined
                    ? {}
                    : { timersEnabled: options.timersEnabled }),
                  botPlayerIds,
                },
              ),
              ...(options.seats === undefined ? {} : { seats: options.seats }),
            };
      sessions.set(actualSetup.matchId, session);
      if (session.status === "active") {
        syncActiveSessionPlayerLabels(session);
        scheduleBotActions(session);
      }
      return buildCreatedResponse(actualSetup, session);
    },
    createRematchSeed(sourceMatchId, playerId, auth) {
      const sourceSession = sessions.get(sourceMatchId);
      if (sourceSession === undefined) {
        return "matchNotFound";
      }
      if (auth === undefined) {
        return "unauthenticated";
      }
      const sourceSeat = sourceSession.seats[String(playerId)];
      if (
        sourceSeat === undefined ||
        sourceSeat.subject === undefined ||
        !subjectsMatch(sourceSeat.subject, auth.subject)
      ) {
        return "forbidden";
      }
      if (sourceSession.status !== "active") {
        return "sourceNotCompleted";
      }
      const loserId = previousLoserId(sourceSession);
      if (loserId === undefined) {
        return "sourceNotCompleted";
      }
      const firstPlayerChoice: FirstPlayerChoiceState = {
        source: "rematch-previous-loser",
        chooserPlayerId: loserId,
        rematchOfMatchId: sourceMatchId,
        previousLoserId: loserId,
      };
      return {
        firstPlayerChoice,
        playerOrder: sourceSession.setup.playerOrder,
        seats: rematchSeatsFromSource(sourceSession.seats),
        botPlayerIds: [...sourceSession.botPlayerIds],
      };
    },
    async resetMatch(matchId, setup) {
      const actualSetup = setup ?? (await createTemplateSetup(matchId));
      const normalizedSetup = { ...actualSetup, matchId };
      const session = createActiveLocalDevMatchSession(
        normalizedSetup,
        sessionService,
        matchTimerPolicy,
        activeSessionSnapshotOptions,
      );
      sessions.set(matchId, session);
      return buildCreatedResponse(normalizedSetup, session);
    },
    chooseFirstPlayer(matchId, playerId, choice) {
      const session = sessions.get(matchId);
      if (session === undefined) {
        return "matchNotFound";
      }
      if (
        session.status === "active" ||
        session.match.state.status.type === "completed" ||
        session.match.state.status.type === "gameOver"
      ) {
        return "alreadyStarted";
      }
      if (playerId !== session.firstPlayerChoice.chooserPlayerId) {
        return "notChooser";
      }
      const firstPlayerId = resolvedFirstPlayerId(
        session.setup,
        playerId,
        choice,
      );
      const resolvedSetup = {
        ...session.setup,
        firstPlayerId,
      };
      const resolvedChoice: FirstPlayerChoiceState = {
        ...session.firstPlayerChoice,
        choice,
        resolvedFirstPlayerId: firstPlayerId,
      };
      const sessionWithSeats: ActiveLocalDevMatchSession = {
        ...createActiveLocalDevMatchSession(
          resolvedSetup,
          sessionService,
          matchTimerPolicy,
          {
            ...activeSessionSnapshotOptions,
            firstPlayerChoice: resolvedChoice,
            timersEnabled: session.timersEnabled,
            botPlayerIds: session.botPlayerIds,
            initialTimers: session.match.state.timers,
          },
        ),
        seats: session.seats,
      };
      syncActiveSessionPlayerLabels(sessionWithSeats);
      sessions.set(matchId, sessionWithSeats);
      void runBotActions(sessionWithSeats);
      return buildCreatedResponse(resolvedSetup, sessionWithSeats);
    },
    claimSeat(matchId, playerId, auth) {
      const session = sessions.get(matchId);
      if (session === undefined) {
        return "matchNotFound";
      }
      const seat = session.seats[String(playerId)];
      if (seat === undefined) {
        return "seatNotFound";
      }
      if (seat.subject !== undefined) {
        if (auth === undefined) {
          return "unauthenticated";
        }
        if (subjectsMatch(seat.subject, auth.subject)) {
          refreshSeatSubject(seat, auth.subject);
          syncActiveSessionPlayerLabels(session);
          return {
            matchId,
            seat: {
              playerId,
              sessionToken: createDevUserSessionToken(
                seat.subject.userId,
                seat.subject.sessionId,
                seat.subject.displayName,
              ),
            },
            ...(session.status === "active"
              ? {}
              : {
                  firstPlayerChoice: firstPlayerChoiceResponse(
                    session.firstPlayerChoice,
                  ),
                }),
          };
        }
        return "claimed";
      }
      if (auth === undefined) {
        return "unauthenticated";
      }
      const sessionToken = createDevUserSessionToken(
        auth.subject.userId,
        auth.subject.sessionId,
        auth.subject.displayName,
      );
      seat.subject = auth.subject;
      syncActiveSessionPlayerLabels(session);
      return {
        matchId,
        seat: { playerId, sessionToken },
        ...(session.status === "active"
          ? {}
          : {
              firstPlayerChoice: firstPlayerChoiceResponse(
                session.firstPlayerChoice,
              ),
            }),
      };
    },
    claimSeatForAuth(matchId, auth) {
      const session = sessions.get(matchId);
      if (session === undefined) {
        return "matchNotFound";
      }
      if (auth === undefined) {
        return "unauthenticated";
      }
      const seat = Object.values(session.seats).find(
        (candidate) =>
          candidate.subject !== undefined &&
          subjectsOwnSameAccount(candidate.subject, auth.subject),
      );
      if (seat === undefined) {
        return "seatNotFound";
      }
      refreshSeatSubject(seat, auth.subject);
      const refreshedSubject = auth.subject;
      syncActiveSessionPlayerLabels(session);
      return {
        matchId,
        seat: {
          playerId: seat.playerId,
          sessionToken: createDevUserSessionToken(
            refreshedSubject.userId,
            refreshedSubject.sessionId,
            refreshedSubject.displayName,
          ),
        },
        ...(session.status === "active"
          ? {}
          : {
              firstPlayerChoice: firstPlayerChoiceResponse(
                session.firstPlayerChoice,
              ),
            }),
      };
    },
    getMatch(matchId) {
      const session = sessions.get(matchId);
      if (session === undefined) {
        return undefined;
      }
      if (session.status === "active") {
        return session.match;
      }
      return session.match.state.status.type === "completed" ||
        session.match.state.status.type === "gameOver"
        ? session.match
        : undefined;
    },
    getFirstPlayerChoice(matchId) {
      const session = sessions.get(matchId);
      if (
        session === undefined ||
        session.status === "active" ||
        session.match.state.status.type === "completed" ||
        session.match.state.status.type === "gameOver"
      ) {
        return undefined;
      }
      return firstPlayerChoiceResponse(session.firstPlayerChoice);
    },
    virtualConnectedPlayerIds(matchId) {
      return sessions.get(matchId)?.botPlayerIds ?? new Set();
    },
    async applyEnvelope(envelope) {
      const session = sessions.get(envelope.matchId);
      if (session === undefined) {
        return "matchNotFound";
      }
      if (session.status !== "active") {
        return {
          type: "actionResult",
          matchId: envelope.matchId,
          clientActionId: envelope.clientActionId,
          accepted: false,
          stateSeq: envelope.expectedStateSeq,
          reason: "illegalAction",
          errors: ["First-player setup is not resolved."],
        };
      }
      const result = sessionService.applyEnvelope(envelope);
      if (result.accepted) {
        await persistCompletedMatchIfNeeded(session);
        scheduleBotActions(session);
      }
      return result;
    },
    advanceTimers({ elapsedMs, connectedPlayerIds, matchIds }) {
      const allowedMatchIds =
        matchIds === undefined ? undefined : new Set(matchIds);
      const changedMatches: TimerAdvanceBroadcast[] = [];
      for (const [matchId, session] of sessions) {
        if (
          !session.timersEnabled ||
          (allowedMatchIds !== undefined && !allowedMatchIds.has(matchId))
        ) {
          continue;
        }
        const result = advanceLocalDevMatchTimers(session.match, {
          elapsedMs,
          connectedPlayerIds: connectedPlayerIdsWithBots(
            connectedPlayerIds(matchId),
            session.botPlayerIds,
          ),
          policy: matchTimerPolicy,
        });
        if (result.expiries.length > 0) {
          applyLocalDevMatchTimerExpiries(session.match, result.expiries);
        }
        if (result.changed || result.expiries.length > 0) {
          changedMatches.push({
            matchId,
            sync: result.expiries.length > 0 ? "state" : "timers",
          });
        }
      }
      return changedMatches;
    },
    authorizeSeat(auth, matchId, playerId) {
      if (auth === undefined) {
        return "unauthenticated";
      }
      const seat = sessions.get(matchId)?.seats[String(playerId)];
      if (
        seat === undefined ||
        seat.subject === undefined ||
        !subjectsMatch(seat.subject, auth.subject)
      ) {
        return "forbidden";
      }
      return "authorized";
    },
  };
};
