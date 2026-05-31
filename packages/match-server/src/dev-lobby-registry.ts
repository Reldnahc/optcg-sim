import type { MatchId, PlayerId } from "@optcg/types";

import {
  createDevMatchSetupFromDeckSubmissions,
  defaultDevDonCounts,
  resolveDevDonCounts,
  validateReadyDevDeckSubmission,
} from "./default-dev-manifest.js";
import {
  decodeDeckHashSubmission,
  type DeckHashCodecPort,
  type DeckSubmission,
} from "./deck-submission.js";
import type { AuthContext } from "./dev-auth.js";
import { subjectsMatch } from "./dev-auth.js";
import {
  matchSeatsWithMatchId,
  type LocalDevMatchRegistry,
} from "./dev-local-match-registry.js";
import type { CreatePremadeDevMatchSetupOptions } from "./local-match.js";
import type { FirstPlayerChoiceState } from "./session-types.js";

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
  seat?: { playerId: PlayerId };
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
  ) => Promise<
    | CreatedDevLobbyResponse
    | "lobbyNotFound"
    | "unauthenticated"
    | "seatNotFound"
    | "invalidDeck"
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
  const [firstPlayerDonCount, secondPlayerDonCount] =
    resolveDevDonCounts(defaultDevDonCounts);

  const donDeckCountForSeat = (playerId: PlayerId): number =>
    playerId === p1 ? firstPlayerDonCount : secondPlayerDonCount;

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
      const existing = Object.values(lobby.seats).find(
        (seat) =>
          seat.subject !== undefined &&
          subjectsMatch(seat.subject, auth.subject),
      );
      if (existing !== undefined) {
        await ensureMatchWhenReady(lobby);
        return {
          ...lobbyResponse(lobby),
          seat: { playerId: existing.playerId },
        };
      }
      const open = Object.values(lobby.seats).find(
        (seat) => seat.subject === undefined,
      );
      if (open === undefined) {
        return "full";
      }
      open.subject = auth.subject;
      await ensureMatchWhenReady(lobby);
      return {
        ...lobbyResponse(lobby),
        seat: { playerId: open.playerId },
      };
    },
    async submitDeck(lobbyId, auth, deckHash) {
      if (auth === undefined) {
        return "unauthenticated";
      }
      const lobby = lobbies.get(lobbyId);
      if (lobby === undefined) {
        return "lobbyNotFound";
      }
      const seat = Object.values(lobby.seats).find(
        (candidate) =>
          candidate.subject !== undefined &&
          subjectsMatch(candidate.subject, auth.subject),
      );
      if (seat === undefined) {
        return "seatNotFound";
      }
      const submission = await decodeDeckHashSubmission({
        hash: deckHash,
        donDeckCount: donDeckCountForSeat(seat.playerId),
        ...(options.deckHashCodec === undefined
          ? {}
          : { codec: options.deckHashCodec }),
      });
      if (submission.status !== "ready") {
        return "invalidDeck";
      }
      try {
        await validateReadyDevDeckSubmission({
          submission,
          createdAt: devLobbyCreatedAt,
          ...(options.fetchCard === undefined
            ? {}
            : { fetchCard: options.fetchCard }),
          ...(options.baseUrl === undefined
            ? {}
            : { baseUrl: options.baseUrl }),
          ...(options.redisUrl === undefined
            ? {}
            : { redisUrl: options.redisUrl }),
        });
      } catch {
        return "invalidDeck";
      }
      seat.deckSubmission = submission;
      await ensureMatchWhenReady(lobby);
      return {
        ...lobbyResponse(lobby),
        seat: { playerId: seat.playerId },
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
