import { createHash } from "node:crypto";

import type { MatchId, PlayerId } from "@optcg/types";

import { devSessionMetadata } from "./dev-session-metadata.js";
import { createDevUserSessionToken, type AuthContext } from "./dev-auth.js";
import { subjectsMatch } from "./dev-auth.js";
import {
  createLocalDevMatch,
  getLocalDevSnapshot,
  setLocalDevMatchPlayerLabels,
  type LocalDevMatch,
} from "./local-match.js";
import {
  createMatchSessionService,
  type MatchSessionService,
} from "./session-service.js";
import type {
  ClientActionEnvelope,
  FirstPlayerChoiceState,
  FirstPlayerChoiceValue,
  SessionActionResult,
} from "./session-types.js";

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

export interface LocalDevMatchSeat {
  matchId: MatchId;
  playerId: PlayerId;
  subject?: AuthContext["subject"];
}

interface ActiveLocalDevMatchSession {
  status: "active";
  match: LocalDevMatch;
  seats: Record<string, LocalDevMatchSeat>;
  setup: LocalDevMatchSetup;
  firstPlayerChoice: FirstPlayerChoiceState;
}

interface PendingFirstPlayerLocalDevMatchSession {
  status: "choosingFirstPlayer";
  setup: LocalDevMatchSetup;
  seats: Record<string, LocalDevMatchSeat>;
  firstPlayerChoice: FirstPlayerChoiceState;
}

type LocalDevMatchSession =
  | ActiveLocalDevMatchSession
  | PendingFirstPlayerLocalDevMatchSession;

export interface LocalDevMatchRegistry {
  createMatch: (
    setup?: LocalDevMatchSetup,
    options?: {
      firstPlayerChoice?: FirstPlayerChoiceState;
      seats?: Record<string, LocalDevMatchSeat>;
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
  applyEnvelope: (
    envelope: ClientActionEnvelope,
  ) => SessionActionResult | "matchNotFound";
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

const createActiveLocalDevMatchSession = (
  setup: LocalDevMatchSetup,
  sessionService: MatchSessionService,
  firstPlayerChoice?: FirstPlayerChoiceState,
): ActiveLocalDevMatchSession => {
  const match = createLocalDevMatch(setup);
  const resolvedChoice =
    firstPlayerChoice ??
    ({
      source: "game-one-random-chooser",
      chooserPlayerId: setup.firstPlayerId,
      choice: "goFirst",
      resolvedFirstPlayerId: setup.firstPlayerId,
    } satisfies FirstPlayerChoiceState);
  sessionService.registerLocalDevMatch({
    local: match,
    metadata: devSessionMetadata(setup, resolvedChoice),
  });
  return {
    status: "active",
    match,
    setup,
    seats: createLocalSeats(setup),
    firstPlayerChoice: resolvedChoice,
  };
};

const createPendingLocalDevMatchSession = (
  setup: LocalDevMatchSetup,
  firstPlayerChoice?: FirstPlayerChoiceState,
  seats?: Record<string, LocalDevMatchSeat>,
): PendingFirstPlayerLocalDevMatchSession => ({
  status: "choosingFirstPlayer",
  setup,
  seats: seats ?? createLocalSeats(setup),
  firstPlayerChoice: pendingFirstPlayerChoice(setup, firstPlayerChoice),
});

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
): ReturnType<typeof getLocalDevSnapshot>["playerLabels"] => {
  const labels = Object.fromEntries(
    Object.values(seats).flatMap((seat) => {
      const displayName = seat.subject?.displayName?.trim();
      return displayName === undefined || displayName.length === 0
        ? []
        : [[seat.playerId, { displayName }] as const];
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
    playerLabelsFromSeats(session.seats),
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
): Promise<LocalDevMatchRegistry> => {
  let nextMatchNumber = 1;
  const sessions = new Map<MatchId, LocalDevMatchSession>();
  const sessionService = createMatchSessionService();
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
  const defaultSetup = await createTemplateSetup("dev-local-match" as MatchId);
  const defaultMatchId = defaultSetup.matchId;
  sessions.set(
    defaultMatchId,
    createActiveLocalDevMatchSession(defaultSetup, sessionService),
  );

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

  return {
    defaultMatchId,
    async createMatch(setup, options) {
      const actualSetup =
        setup ??
        (await createTemplateSetup(
          `dev-local-match-${String(nextMatchNumber++)}` as MatchId,
        ));
      const session = createPendingLocalDevMatchSession(
        actualSetup,
        options?.firstPlayerChoice,
        options?.seats,
      );
      sessions.set(actualSetup.matchId, session);
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
      };
    },
    async resetMatch(matchId, setup) {
      const actualSetup = setup ?? (await createTemplateSetup(matchId));
      const normalizedSetup = { ...actualSetup, matchId };
      const session = createActiveLocalDevMatchSession(
        normalizedSetup,
        sessionService,
      );
      sessions.set(matchId, session);
      return buildCreatedResponse(normalizedSetup, session);
    },
    chooseFirstPlayer(matchId, playerId, choice) {
      const session = sessions.get(matchId);
      if (session === undefined) {
        return "matchNotFound";
      }
      if (session.status === "active") {
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
          resolvedChoice,
        ),
        seats: session.seats,
      };
      syncActiveSessionPlayerLabels(sessionWithSeats);
      sessions.set(matchId, sessionWithSeats);
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
    getMatch(matchId) {
      const session = sessions.get(matchId);
      return session?.status === "active" ? session.match : undefined;
    },
    getFirstPlayerChoice(matchId) {
      const session = sessions.get(matchId);
      return session === undefined
        ? undefined
        : firstPlayerChoiceResponse(session.firstPlayerChoice);
    },
    applyEnvelope(envelope) {
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
      return sessionService.applyEnvelope(envelope);
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
