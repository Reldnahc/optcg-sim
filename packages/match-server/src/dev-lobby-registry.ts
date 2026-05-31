import type { MatchId, PlayerId } from "@optcg/types";

import {
  createDevMatchSetupFromDeckSubmissions,
  defaultDevDonCounts,
  resolveDevDonCounts,
} from "./default-dev-manifest.js";
import {
  decodeDeckHashSubmission,
  type DeckHashCodecPort,
  type DeckSubmission,
} from "./deck-submission.js";
import type { AuthContext } from "./dev-auth.js";
import { subjectsMatch } from "./dev-auth.js";
import type { LocalDevMatchRegistry } from "./dev-local-match-registry.js";
import type { CreatePremadeDevMatchSetupOptions } from "./local-match.js";

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
  subject?: AuthContext["subject"] | undefined;
  deckSubmission?: DeckSubmission;
}

interface LocalDevLobby {
  lobbyId: string;
  seats: Record<string, LocalDevLobbySeat>;
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
}

export interface CreateLocalDevLobbyRegistryOptions extends CreatePremadeDevMatchSetupOptions {
  readonly deckHashCodec?: DeckHashCodecPort;
}

const p1 = "p1" as PlayerId;
const p2 = "p2" as PlayerId;

const createLobbySeats = (): LocalDevLobby["seats"] => ({
  p1: { playerId: p1 },
  p2: { playerId: p2 },
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
    const created = await matchRegistry.createMatch(
      await createDevMatchSetupFromDeckSubmissions({
        matchId: `${lobby.lobbyId}-match` as MatchId,
        firstPlayerId: p1,
        playerOrder: [p1, p2],
        createdAt: "2026-05-04T00:00:00.000Z",
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
      seat.deckSubmission = submission;
      if (submission.status !== "ready") {
        return "invalidDeck";
      }
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
  };
};
