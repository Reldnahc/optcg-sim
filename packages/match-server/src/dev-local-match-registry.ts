import { randomUUID } from "node:crypto";

import type { MatchId, PlayerId } from "@optcg/types";

import {
  buildLocalCompletedMatchRecord,
  type CompletedMatchSeatContext,
} from "./local-completed-match-record.js";
import { createDevUserSessionToken, type AuthContext } from "./dev-auth.js";
import { subjectsMatch, subjectsOwnSameAccount } from "./dev-auth.js";
import {
  getLocalDevSnapshot,
  setLocalDevMatchPlayerLabels,
  type LocalDevMatch,
} from "./local-match.js";
import {
  advanceLocalDevMatchTimers,
  applyLocalDevMatchTimerExpiries,
  defaultMatchTimerPolicy,
  type MatchTimerPolicy,
} from "./match-timers.js";
import { createMatchSessionService } from "./session-service.js";
import {
  recordActionTimingSpan,
  recordActionTimingSpanAsync,
} from "./action-timing-log.js";
import type {
  ClientActionEnvelope,
  FirstPlayerChoiceState,
  FirstPlayerChoiceValue,
  MatchPersistence,
  SessionActionRequest,
  SessionActionResult,
} from "./session-types.js";
import type { CompletedMatchRepository } from "./postgres-completed-match.js";
import { defaultBotStrategy, type BotStrategy } from "./bot-player.js";
import { requestHash } from "./action-envelope.js";
import {
  createActiveLocalDevMatchSession,
  createPendingLocalDevMatchSession,
  resolvedFirstPlayerId,
  type ActiveLocalDevMatchSession,
  type LocalDevMatchSession,
  type LocalDevMatchSetup,
} from "./dev-local-match-session-factory.js";
import { recoverPersistedLocalDevMatchSessions } from "./dev-local-match-recovery.js";

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
  }) => readonly TimerAdvanceBroadcast[];
  authorizeSeat: (
    auth: AuthContext | undefined,
    matchId: MatchId,
    playerId: PlayerId,
  ) => "authorized" | "unauthenticated" | "forbidden";
  defaultMatchId: MatchId;
}

const firstPlayerChoiceResponse = (
  firstPlayerChoice: FirstPlayerChoiceState,
): CreatedDevMatchResponse["firstPlayerChoice"] => ({
  chooserPlayerId: firstPlayerChoice.chooserPlayerId,
  choices: ["goFirst", "goSecond"],
  ...(firstPlayerChoice.resolvedFirstPlayerId === undefined
    ? {}
    : { resolvedFirstPlayerId: firstPlayerChoice.resolvedFirstPlayerId }),
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

const isCompletedSession = (session: ActiveLocalDevMatchSession): boolean =>
  session.match.state.status.type === "completed" ||
  session.match.state.status.type === "gameOver";

export const createLocalDevMatchRegistry = async (
  createDefaultSetup: (matchId?: MatchId) => Promise<LocalDevMatchSetup>,
  initialSetup?: LocalDevMatchSetup,
  options: {
    readonly botActionDelayMs?: number;
    readonly createDefaultMatch?: boolean;
    readonly completedMatchRepository?: CompletedMatchRepository;
    readonly includeActionSnapshots?: boolean;
    readonly matchPersistence?: MatchPersistence;
    readonly recoveryLockTtlMs?: number;
    readonly recoveryOwnerInstanceId?: string;
    readonly matchTimerPolicy?: MatchTimerPolicy;
    readonly onBotActionAccepted?: (matchId: MatchId) => void;
    readonly botStrategy?: BotStrategy;
  } = {},
): Promise<LocalDevMatchRegistry> => {
  let nextMatchNumber = 1;
  const sessions = new Map<MatchId, LocalDevMatchSession>();
  const completedPersistedMatchIds = new Set<MatchId>();
  const completedPersistingMatchIds = new Set<MatchId>();
  const activeBotRuns = new Set<MatchId>();
  const pendingCheckpointWrites = new Map<MatchId, Promise<void>>();
  const sessionService = createMatchSessionService();
  const matchTimerPolicy = options.matchTimerPolicy ?? defaultMatchTimerPolicy;
  const botStrategy = options.botStrategy ?? defaultBotStrategy;
  const botActionDelayMs = options.botActionDelayMs ?? 1_000;
  const matchPersistence = options.matchPersistence;
  const recoveryOwnerInstanceId =
    options.recoveryOwnerInstanceId ?? `dev-registry:${randomUUID()}`;
  const recoveryLockTtlMs = options.recoveryLockTtlMs ?? 30_000;
  const includeActionSnapshots = options.includeActionSnapshots;
  const activeSessionSnapshotOptions =
    includeActionSnapshots === undefined ? {} : { includeActionSnapshots };
  const saveSessionCheckpoint = (matchId: MatchId): Promise<void> => {
    const write = sessionService.saveSnapshot(matchId);
    const trackedWrite = write.finally(() => {
      if (pendingCheckpointWrites.get(matchId) === trackedWrite) {
        pendingCheckpointWrites.delete(matchId);
      }
    });
    pendingCheckpointWrites.set(matchId, trackedWrite);
    return trackedWrite;
  };
  const waitForPendingCheckpoint = async (matchId: MatchId): Promise<void> => {
    await pendingCheckpointWrites.get(matchId);
  };
  const captureSessionRollbackState = (matchId: MatchId) => ({
    session: sessions.get(matchId),
    runtime: sessionService.getRuntime(matchId),
  });
  const restoreSessionRollbackState = (
    matchId: MatchId,
    rollbackState: ReturnType<typeof captureSessionRollbackState>,
  ): void => {
    if (rollbackState.session === undefined) {
      sessions.delete(matchId);
    } else {
      sessions.set(matchId, rollbackState.session);
    }
    sessionService.restoreRuntime(matchId, rollbackState.runtime);
  };
  const saveActiveSessionCheckpoint = async (
    matchId: MatchId,
    session: LocalDevMatchSession,
  ): Promise<void> => {
    if (session.status === "active") {
      await saveSessionCheckpoint(matchId);
    }
  };
  const restoreSeatSubject = (
    seat: LocalDevMatchSeat,
    subject: LocalDevMatchSeat["subject"],
  ): void => {
    if (subject === undefined) {
      delete seat.subject;
      return;
    }
    seat.subject = subject;
  };
  const saveSeatSubjectChange = async (
    matchId: MatchId,
    session: LocalDevMatchSession,
    seat: LocalDevMatchSeat,
    updateSubject: () => void,
  ): Promise<void> => {
    const previousSubject =
      seat.subject === undefined ? undefined : structuredClone(seat.subject);
    updateSubject();
    syncActiveSessionPlayerLabels(session);
    try {
      await saveActiveSessionCheckpoint(matchId, session);
    } catch (error: unknown) {
      restoreSeatSubject(seat, previousSubject);
      syncActiveSessionPlayerLabels(session);
      throw error;
    }
  };
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
  const recoverPersistedActiveMatches = async (): Promise<void> => {
    if (matchPersistence === undefined) {
      return;
    }
    const recoveredSessions = await recoverPersistedLocalDevMatchSessions({
      matchPersistence,
      sessionService,
      recoveryOwnerInstanceId,
      recoveryLockTtlMs,
      ...(includeActionSnapshots === undefined
        ? {}
        : { includeActionSnapshots }),
    });
    for (const session of recoveredSessions) {
      syncActiveSessionPlayerLabels(session);
      sessions.set(session.match.state.matchId, session);
    }
  };
  const defaultMatchId = "dev-local-match" as MatchId;
  await recoverPersistedActiveMatches();
  if (options.createDefaultMatch !== false && !sessions.has(defaultMatchId)) {
    const defaultSetup = await createTemplateSetup(defaultMatchId);
    sessions.set(
      defaultSetup.matchId,
      createActiveLocalDevMatchSession(
        defaultSetup,
        sessionService,
        matchTimerPolicy,
        {
          ...activeSessionSnapshotOptions,
          ...(matchPersistence === undefined
            ? {}
            : { persistence: matchPersistence }),
        },
      ),
    );
    await saveSessionCheckpoint(defaultSetup.matchId);
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
      !isCompletedSession(session) ||
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

  const scheduleCompletedMatchPersistence = (
    session: ActiveLocalDevMatchSession,
  ): void => {
    const matchId = session.match.state.matchId;
    if (
      options.completedMatchRepository === undefined ||
      !isCompletedSession(session) ||
      completedPersistedMatchIds.has(matchId) ||
      completedPersistingMatchIds.has(matchId)
    ) {
      return;
    }
    completedPersistingMatchIds.add(matchId);
    setTimeout(() => {
      void persistCompletedMatchIfNeeded(session).then(
        () => {
          completedPersistingMatchIds.delete(matchId);
        },
        () => {
          completedPersistingMatchIds.delete(matchId);
        },
      );
    }, 0);
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
          await sessionService.flushPersistence(matchId);
          acceptedAction = true;
          scheduleCompletedMatchPersistence(session);
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
      const rollbackState = captureSessionRollbackState(actualSetup.matchId);
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
                  ...(options.seats === undefined
                    ? {}
                    : { seats: options.seats }),
                  botPlayerIds,
                  ...(matchPersistence === undefined
                    ? {}
                    : { persistence: matchPersistence }),
                },
              ),
            };
      sessions.set(actualSetup.matchId, session);
      if (session.status === "active") {
        try {
          await saveSessionCheckpoint(actualSetup.matchId);
        } catch (error: unknown) {
          restoreSessionRollbackState(actualSetup.matchId, rollbackState);
          throw error;
        }
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
      const rollbackState = captureSessionRollbackState(matchId);
      const session = createActiveLocalDevMatchSession(
        normalizedSetup,
        sessionService,
        matchTimerPolicy,
        {
          ...activeSessionSnapshotOptions,
          ...(matchPersistence === undefined
            ? {}
            : { persistence: matchPersistence }),
        },
      );
      sessions.set(matchId, session);
      try {
        await saveSessionCheckpoint(matchId);
      } catch (error: unknown) {
        restoreSessionRollbackState(matchId, rollbackState);
        throw error;
      }
      return buildCreatedResponse(normalizedSetup, session);
    },
    async chooseFirstPlayer(matchId, playerId, choice) {
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
      const rollbackState = captureSessionRollbackState(matchId);
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
            seats: session.seats,
            initialTimers: session.match.state.timers,
            ...(matchPersistence === undefined
              ? {}
              : { persistence: matchPersistence }),
          },
        ),
      };
      syncActiveSessionPlayerLabels(sessionWithSeats);
      sessions.set(matchId, sessionWithSeats);
      try {
        await saveSessionCheckpoint(matchId);
      } catch (error: unknown) {
        restoreSessionRollbackState(matchId, rollbackState);
        throw error;
      }
      scheduleBotActions(sessionWithSeats);
      return buildCreatedResponse(resolvedSetup, sessionWithSeats);
    },
    async claimSeat(matchId, playerId, auth) {
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
          await saveSeatSubjectChange(matchId, session, seat, () => {
            refreshSeatSubject(seat, auth.subject);
          });
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
      await saveSeatSubjectChange(matchId, session, seat, () => {
        seat.subject = auth.subject;
      });
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
    async claimSeatForAuth(matchId, auth) {
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
      await saveSeatSubjectChange(matchId, session, seat, () => {
        refreshSeatSubject(seat, auth.subject);
      });
      const refreshedSubject = auth.subject;
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
        return "matchNotFound" as const;
      }
      if (session.status !== "active") {
        return {
          type: "actionResult" as const,
          matchId: envelope.matchId,
          clientActionId: envelope.clientActionId,
          accepted: false as const,
          stateSeq: envelope.expectedStateSeq,
          reason: "illegalAction" as const,
          errors: ["First-player setup is not resolved."],
        };
      }
      await waitForPendingCheckpoint(envelope.matchId);
      const result = sessionService.applyEnvelope(envelope);
      if (result.accepted) {
        await sessionService.flushPersistence(envelope.matchId);
        scheduleCompletedMatchPersistence(session);
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
