import { createHash, randomUUID } from "node:crypto";

import type { MatchId, PlayerId } from "@optcg/types";

import { devSessionMetadata } from "./dev-session-metadata.js";
import type { AuthContext } from "./dev-auth.js";
import { subjectsMatch } from "./dev-auth.js";
import {
  createLocalDevMatch,
  getLocalDevSnapshot,
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

interface MatchSeat {
  matchId: MatchId;
  playerId: PlayerId;
  subject?: AuthContext["subject"];
}

interface ActiveLocalDevMatchSession {
  status: "active";
  match: LocalDevMatch;
  seats: Record<string, MatchSeat>;
  setup: LocalDevMatchSetup;
  firstPlayerChoice: FirstPlayerChoiceState;
}

interface PendingFirstPlayerLocalDevMatchSession {
  status: "choosingFirstPlayer";
  setup: LocalDevMatchSetup;
  seats: Record<string, MatchSeat>;
  firstPlayerChoice: FirstPlayerChoiceState;
}

type LocalDevMatchSession =
  | ActiveLocalDevMatchSession
  | PendingFirstPlayerLocalDevMatchSession;

export interface LocalDevMatchRegistry {
  createMatch: (setup?: LocalDevMatchSetup) => Promise<CreatedDevMatchResponse>;
  resetMatch: (
    matchId: MatchId,
    setup?: LocalDevMatchSetup,
  ) => Promise<CreatedDevMatchResponse>;
  claimSeat: (
    matchId: MatchId,
    playerId: PlayerId,
    auth: AuthContext | undefined,
  ) => ClaimedDevSeatResponse | "matchNotFound" | "seatNotFound" | "claimed";
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

const createLocalAnonSeats = (
  setup: LocalDevMatchSetup,
): Record<string, MatchSeat> =>
  Object.fromEntries(
    setup.playerOrder.map((playerId): [string, MatchSeat] => [
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
): FirstPlayerChoiceState => ({
  source: "game-one-random-chooser",
  chooserPlayerId: selectedChooserForSetup(setup),
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
    seats: createLocalAnonSeats(setup),
    firstPlayerChoice: resolvedChoice,
  };
};

const createPendingLocalDevMatchSession = (
  setup: LocalDevMatchSetup,
): PendingFirstPlayerLocalDevMatchSession => ({
  status: "choosingFirstPlayer",
  setup,
  seats: createLocalAnonSeats(setup),
  firstPlayerChoice: pendingFirstPlayerChoice(setup),
});

const createdSeatResponse = (
  seats: Record<string, MatchSeat>,
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
  ): CreatedDevMatchResponse => ({
    matchId: setup.matchId,
    seats: createdSeatResponse(session.seats),
    firstPlayerChoice: firstPlayerChoiceResponse(session.firstPlayerChoice),
    ...(session.status === "active"
      ? { snapshot: getLocalDevSnapshot(session.match) }
      : {}),
  });

  return {
    defaultMatchId,
    async createMatch(setup) {
      const actualSetup =
        setup ??
        (await createTemplateSetup(
          `dev-local-match-${String(nextMatchNumber++)}` as MatchId,
        ));
      const session = createPendingLocalDevMatchSession(actualSetup);
      sessions.set(actualSetup.matchId, session);
      return buildCreatedResponse(actualSetup, session);
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
        if (
          auth !== undefined &&
          subjectsMatch(seat.subject, auth.subject) &&
          seat.subject.type === "anonymousDev"
        ) {
          return {
            matchId,
            seat: {
              playerId,
              sessionToken: seat.subject.devSessionId,
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
      const sessionToken =
        auth?.subject.type === "anonymousDev"
          ? auth.subject.devSessionId
          : `dev-local:${String(matchId)}:${String(playerId)}:${randomUUID()}`;
      seat.subject = { type: "anonymousDev", devSessionId: sessionToken };
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
