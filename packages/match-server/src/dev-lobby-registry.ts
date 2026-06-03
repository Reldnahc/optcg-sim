import type { MatchId, PlayerId } from "@optcg/types";

import {
  createDevMatchSetupFromDeckSubmissions,
  validateReadyDevDeckSubmission,
} from "./default-dev-manifest.js";
import {
  createDeckSubmissionFromResolvedLoadout,
  decodeDeckHashSubmission,
  type DeckHashCodecPort,
  type DeckSubmission,
  type ReadyDeckSubmission,
} from "./deck-submission.js";
import type { AuthContext } from "./dev-auth.js";
import { createDevUserSessionToken } from "./dev-auth.js";
import { subjectsMatch } from "./dev-auth.js";
import {
  matchSeatsWithMatchId,
  type LocalDevMatchRegistry,
} from "./dev-local-match-registry.js";
import type { CreatePremadeDevMatchSetupOptions } from "./local-match.js";
import type { FirstPlayerChoiceState } from "./session-types.js";
import type { VerifiedSimHandoff } from "./sim-handoff.js";

export interface CreatedDevLobbyResponse {
  lobbyId: string;
  seats: Record<
    string,
    {
      playerId: PlayerId;
      claimed: boolean;
      deck: { status: "missing" | "ready" | "invalid" };
    }
  >;
  matchId?: MatchId;
  seat?: { playerId: PlayerId; sessionToken?: string };
}

interface LocalDevLobbySeat {
  playerId: PlayerId;
  subject?: AuthContext["subject"];
  deckSubmission?: DeckSubmission;
}

interface LocalDevLobby {
  lobbyId: string;
  seats: Record<string, LocalDevLobbySeat>;
  firstPlayerChoice?: FirstPlayerChoiceState;
  playerOrder?: readonly [PlayerId, PlayerId];
  matchId?: MatchId;
}

export interface LocalDevLobbyRegistry {
  createLobby: () => CreatedDevLobbyResponse;
  joinLobby: (
    lobbyId: string,
    auth: AuthContext | undefined,
  ) => Promise<
    CreatedDevLobbyResponse | "lobbyNotFound" | "unauthenticated" | "full"
  >;
  submitDeck: (
    lobbyId: string,
    auth: AuthContext | undefined,
    deckHash: string,
    donDeckCount: number,
  ) => Promise<
    | CreatedDevLobbyResponse
    | "lobbyNotFound"
    | "unauthenticated"
    | "seatNotFound"
    | "invalidDeck"
  >;
  submitVerifiedLoadout: (
    lobbyId: string,
    handoff: VerifiedSimHandoff,
  ) => Promise<
    | CreatedDevLobbyResponse
    | "lobbyNotFound"
    | "seatNotFound"
    | "invalidDeck"
    | "full"
  >;
  getLobby: (lobbyId: string) => CreatedDevLobbyResponse | undefined;
  createRematchLobby: (
    sourceMatchId: MatchId,
    playerId: PlayerId,
    auth: AuthContext | undefined,
  ) =>
    | CreatedDevLobbyResponse
    | "matchNotFound"
    | "unauthenticated"
    | "forbidden"
    | "sourceNotCompleted"
    | "noPreviousLoser";
}

export interface CreateLocalDevLobbyRegistryOptions extends CreatePremadeDevMatchSetupOptions {
  readonly deckHashCodec?: DeckHashCodecPort;
}

const p1 = "p1" as PlayerId;
const p2 = "p2" as PlayerId;
const devLobbyCreatedAt = "2026-05-04T00:00:00.000Z";

const createLobbySeats = (): LocalDevLobby["seats"] => ({
  p1: { playerId: p1 },
  p2: { playerId: p2 },
});

const twoPlayerOrder = (
  playerOrder: readonly PlayerId[] | undefined,
): readonly [PlayerId, PlayerId] => {
  const first = playerOrder?.[0] ?? p1;
  const second = playerOrder?.[1] ?? p2;
  return [first, second];
};

const authFromHandoff = (handoff: VerifiedSimHandoff): AuthContext => ({
  subject: {
    type: "user",
    userId: handoff.claims.sub,
    sessionId: handoff.claims.sid,
  },
});

const lobbyResponse = (lobby: LocalDevLobby): CreatedDevLobbyResponse => ({
  lobbyId: lobby.lobbyId,
  seats: Object.fromEntries(
    Object.entries(lobby.seats).map(([key, seat]) => [
      key,
      {
        playerId: seat.playerId,
        claimed: seat.subject !== undefined,
        deck: { status: seat.deckSubmission?.status ?? "missing" },
      },
    ]),
  ),
  ...(lobby.matchId === undefined ? {} : { matchId: lobby.matchId }),
});

export const createLocalDevLobbyRegistry = (
  matchRegistry: LocalDevMatchRegistry,
  options: CreateLocalDevLobbyRegistryOptions,
): LocalDevLobbyRegistry => {
  let nextLobbyNumber = 1;
  const lobbies = new Map<string, LocalDevLobby>();
  const findSeatForAuth = (
    lobby: LocalDevLobby,
    auth: AuthContext,
  ): LocalDevLobbySeat | undefined =>
    Object.values(lobby.seats).find(
      (seat) =>
        seat.subject !== undefined && subjectsMatch(seat.subject, auth.subject),
    );
  const claimOpenSeat = (
    lobby: LocalDevLobby,
    auth: AuthContext,
  ): LocalDevLobbySeat | "full" => {
    const existing = findSeatForAuth(lobby, auth);
    if (existing !== undefined) {
      return existing;
    }
    const open = Object.values(lobby.seats).find(
      (seat) => seat.subject === undefined,
    );
    if (open === undefined) {
      return "full";
    }
    open.subject = auth.subject;
    return open;
  };
  const validateReadySubmission = async (
    submission: ReadyDeckSubmission,
  ): Promise<boolean> => {
    try {
      await validateReadyDevDeckSubmission({
        submission,
        createdAt: devLobbyCreatedAt,
        ...(options.fetchCard === undefined
          ? {}
          : { fetchCard: options.fetchCard }),
        ...(options.baseUrl === undefined ? {} : { baseUrl: options.baseUrl }),
        ...(options.redisUrl === undefined
          ? {}
          : { redisUrl: options.redisUrl }),
      });
      return true;
    } catch {
      return false;
    }
  };
  const ensureMatchWhenReady = async (lobby: LocalDevLobby): Promise<void> => {
    if (
      lobby.matchId !== undefined ||
      !Object.values(lobby.seats).every(
        (seat) =>
          seat.subject !== undefined && seat.deckSubmission?.status === "ready",
      )
    ) {
      return;
    }
    const first = lobby.seats["p1"]?.deckSubmission;
    const second = lobby.seats["p2"]?.deckSubmission;
    if (first?.status !== "ready" || second?.status !== "ready") {
      return;
    }
    const matchId = `${lobby.lobbyId}-match` as MatchId;
    const playerOrder = twoPlayerOrder(lobby.playerOrder);
    const created = await matchRegistry.createMatch(
      await createDevMatchSetupFromDeckSubmissions({
        matchId,
        firstPlayerId: playerOrder[0],
        playerOrder,
        createdAt: devLobbyCreatedAt,
        firstPlayer: first,
        secondPlayer: second,
        ...(options.fetchCard === undefined
          ? {}
          : { fetchCard: options.fetchCard }),
        ...(options.baseUrl === undefined ? {} : { baseUrl: options.baseUrl }),
        ...(options.redisUrl === undefined
          ? {}
          : { redisUrl: options.redisUrl }),
      }),
      {
        ...(lobby.firstPlayerChoice === undefined
          ? {}
          : { firstPlayerChoice: lobby.firstPlayerChoice }),
        seats: matchSeatsWithMatchId(lobby.seats, matchId),
      },
    );
    lobby.matchId = created.matchId;
  };

  return {
    createLobby() {
      const lobby: LocalDevLobby = {
        lobbyId: `dev-local-lobby-${String(nextLobbyNumber++)}`,
        seats: createLobbySeats(),
      };
      lobbies.set(lobby.lobbyId, lobby);
      return lobbyResponse(lobby);
    },
    async joinLobby(lobbyId, auth) {
      if (auth === undefined) {
        return "unauthenticated";
      }
      const lobby = lobbies.get(lobbyId);
      if (lobby === undefined) {
        return "lobbyNotFound";
      }
      const existing = findSeatForAuth(lobby, auth);
      if (existing !== undefined) {
        await ensureMatchWhenReady(lobby);
        return {
          ...lobbyResponse(lobby),
          seat: { playerId: existing.playerId },
        };
      }
      const open = claimOpenSeat(lobby, auth);
      if (open === "full") {
        return "full";
      }
      await ensureMatchWhenReady(lobby);
      return {
        ...lobbyResponse(lobby),
        seat: { playerId: open.playerId },
      };
    },
    async submitDeck(lobbyId, auth, deckHash, donDeckCount) {
      if (auth === undefined) {
        return "unauthenticated";
      }
      const lobby = lobbies.get(lobbyId);
      if (lobby === undefined) {
        return "lobbyNotFound";
      }
      const seat = findSeatForAuth(lobby, auth);
      if (seat === undefined) {
        return "seatNotFound";
      }
      const submission = await decodeDeckHashSubmission({
        hash: deckHash,
        donDeckCount,
        ...(options.deckHashCodec === undefined
          ? {}
          : { codec: options.deckHashCodec }),
      });
      if (submission.status !== "ready") {
        return "invalidDeck";
      }
      if (!(await validateReadySubmission(submission))) {
        return "invalidDeck";
      }
      seat.deckSubmission = submission;
      await ensureMatchWhenReady(lobby);
      return {
        ...lobbyResponse(lobby),
        seat: { playerId: seat.playerId },
      };
    },
    async submitVerifiedLoadout(lobbyId, handoff) {
      const lobby = lobbies.get(lobbyId);
      if (lobby === undefined) {
        return "lobbyNotFound";
      }
      const auth = authFromHandoff(handoff);
      const seat = claimOpenSeat(lobby, auth);
      if (seat === "full") {
        return "full";
      }
      if (
        handoff.claims.lobby_id !== null &&
        handoff.claims.lobby_id !== lobbyId
      ) {
        return "seatNotFound";
      }
      if (
        handoff.claims.seat_id !== null &&
        handoff.claims.seat_id !== String(seat.playerId)
      ) {
        return "seatNotFound";
      }
      const submission = createDeckSubmissionFromResolvedLoadout(
        handoff.resolvedLoadout,
      );
      if (!(await validateReadySubmission(submission))) {
        return "invalidDeck";
      }
      seat.deckSubmission = submission;
      await ensureMatchWhenReady(lobby);
      return {
        ...lobbyResponse(lobby),
        seat: {
          playerId: seat.playerId,
          sessionToken: createDevUserSessionToken(
            handoff.claims.sub,
            handoff.claims.sid,
          ),
        },
      };
    },
    getLobby(lobbyId) {
      const lobby = lobbies.get(lobbyId);
      return lobby === undefined ? undefined : lobbyResponse(lobby);
    },
    createRematchLobby(sourceMatchId, playerId, auth) {
      const seed = matchRegistry.createRematchSeed(
        sourceMatchId,
        playerId,
        auth,
      );
      if (typeof seed === "string") {
        return seed;
      }
      const playerOrder = twoPlayerOrder(seed.playerOrder);
      const lobby: LocalDevLobby = {
        lobbyId: `${String(sourceMatchId)}-rematch-lobby-${String(
          nextLobbyNumber++,
        )}`,
        seats: Object.fromEntries(
          Object.entries(seed.seats).map(([key, seat]) => [
            key,
            {
              playerId: seat.playerId,
              ...(seat.subject === undefined
                ? {}
                : { subject: structuredClone(seat.subject) }),
            },
          ]),
        ),
        firstPlayerChoice: seed.firstPlayerChoice,
        playerOrder,
      };
      lobbies.set(lobby.lobbyId, lobby);
      return {
        ...lobbyResponse(lobby),
        seat: { playerId },
      };
    },
  };
};
