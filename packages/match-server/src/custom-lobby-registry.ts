import { randomUUID } from "node:crypto";

import { createRedisCardDataCache, type CardDataCache } from "@optcg/cards";
import type { CardId, MatchId, PlayerId } from "@optcg/types";

import {
  createDevMatchSetupFromDeckSubmissions,
  defaultDevDeckFormatId,
  validateReadyDevDeckSubmission,
  validateReadyDevDeckSubmissions,
} from "./default-dev-manifest.js";
import {
  createPoneglyphDeckHashCodec,
  decodeDeckHashSubmission,
  type DeckHashCodecPort,
  type ReadyDeckSubmission,
} from "./deck-submission.js";
import type { AuthContext } from "./dev-auth.js";
import { createDevUserSessionToken } from "./dev-auth.js";
import { subjectsOwnSameAccount } from "./dev-auth.js";
import {
  matchSeatsWithMatchId,
  type LocalDevMatchRegistry,
} from "./dev-local-match-registry.js";
import {
  createDefaultLobbySeats,
  createMemoryLobbyStore,
  createRedisClientForLobbyStore,
  createRedisLobbyStore,
  type CustomLobbySettings,
  type LobbyStore,
  type CustomLobbySeatState,
  type CustomLobbyState,
} from "./lobby-store.js";
import type { CreatePremadeDevMatchSetupOptions } from "./local-match.js";
import { resolveRedisConfig } from "./redis-config.js";
import type {
  SimHandoffBatchVerificationResult,
  VerifiedSimHandoff,
} from "./sim-handoff.js";
import {
  recordLobbyValidationTimingSpan,
  type LobbyValidationTimingSpan,
} from "./lobby-validation-timing-log.js";

export interface CreatedCustomLobbyResponse {
  lobbyId: string;
  joinCode?: string;
  settings: CustomLobbySettings;
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

export interface PendingRematchResponse {
  rematch: { status: "pending" };
}

export interface ValidatedCustomLobbyLoadout {
  readonly loadoutId: string | null;
  readonly status: "playable" | "unplayable" | "unverified";
  readonly errors: readonly string[];
}

export interface ValidatedCustomLobbyLoadoutsResponse {
  readonly data: {
    readonly loadouts: readonly ValidatedCustomLobbyLoadout[];
  };
}

export interface CustomLobbyDeckValidationInput {
  readonly loadoutId: string;
  readonly deckHash: string;
  readonly donDeckCount: number;
}

interface PendingDecodedSubmission {
  readonly index: number;
  readonly loadoutId: string;
  readonly submission: ReadyDeckSubmission;
}

export interface CustomLobbyRegistry {
  createLobby: (
    settings?: Partial<CustomLobbySettings>,
  ) => Promise<CreatedCustomLobbyResponse>;
  joinLobby: (
    lobbyId: string,
    auth: AuthContext | undefined,
  ) => Promise<
    CreatedCustomLobbyResponse | "lobbyNotFound" | "unauthenticated" | "full"
  >;
  joinLobbyByCode: (
    joinCode: string,
    auth: AuthContext | undefined,
  ) => Promise<
    CreatedCustomLobbyResponse | "lobbyNotFound" | "unauthenticated" | "full"
  >;
  submitDeck: (
    lobbyId: string,
    auth: AuthContext | undefined,
    deckHash: string,
    donDeckCount: number,
  ) => Promise<
    | CreatedCustomLobbyResponse
    | "lobbyNotFound"
    | "unauthenticated"
    | "seatNotFound"
    | "invalidDeck"
  >;
  submitVerifiedLoadout: (
    lobbyId: string,
    handoff: VerifiedSimHandoff,
  ) => Promise<
    | CreatedCustomLobbyResponse
    | "lobbyNotFound"
    | "seatNotFound"
    | "invalidDeck"
    | "full"
  >;
  validateLoadouts: (
    lobbyId: string,
    handoffs: readonly SimHandoffBatchVerificationResult[],
    timingSpans?: LobbyValidationTimingSpan[],
  ) => Promise<ValidatedCustomLobbyLoadoutsResponse | "lobbyNotFound">;
  validateDecks: (
    lobbyId: string,
    decks: readonly CustomLobbyDeckValidationInput[],
    timingSpans?: LobbyValidationTimingSpan[],
  ) => Promise<ValidatedCustomLobbyLoadoutsResponse | "lobbyNotFound">;
  getLobby: (
    lobbyId: string,
  ) => Promise<CreatedCustomLobbyResponse | undefined>;
  authorizeSeat: (
    auth: AuthContext | undefined,
    lobbyId: string,
    playerId: PlayerId,
  ) => Promise<
    "authorized" | "lobbyNotFound" | "unauthenticated" | "forbidden"
  >;
  createRematchLobby: (
    sourceMatchId: MatchId,
    playerId: PlayerId,
    auth: AuthContext | undefined,
  ) => Promise<
    | CreatedCustomLobbyResponse
    | PendingRematchResponse
    | "matchNotFound"
    | "unauthenticated"
    | "forbidden"
    | "sourceNotCompleted"
    | "noPreviousLoser"
  >;
  cancelRematchConsensusForMatch: (sourceMatchId: MatchId) => boolean;
  cancelRematchLobby: (lobbyId: string) => Promise<boolean>;
}

export interface CreateCustomLobbyRegistryOptions extends CreatePremadeDevMatchSetupOptions {
  readonly deckHashCodec?: DeckHashCodecPort;
  readonly lobbyStore?: LobbyStore;
}

const devLobbyCreatedAt = "2026-05-04T00:00:00.000Z";

const twoPlayerOrder = (
  playerOrder: readonly PlayerId[] | undefined,
): readonly [PlayerId, PlayerId] => {
  const first = playerOrder?.[0] ?? ("p1" as PlayerId);
  const second = playerOrder?.[1] ?? ("p2" as PlayerId);
  return [first, second];
};

const authFromHandoff = (handoff: VerifiedSimHandoff): AuthContext => ({
  subject: {
    type: "user",
    userId: handoff.claims.sub,
    sessionId: handoff.claims.sid,
  },
});

const defaultLobbySettings = (): CustomLobbySettings => ({
  formatId: defaultDevDeckFormatId,
});

const createLobbySettings = (
  settings: Partial<CustomLobbySettings> | undefined,
): CustomLobbySettings => ({
  formatId: settings?.formatId ?? defaultDevDeckFormatId,
  ...(settings?.timerDisabled === true ? { timerDisabled: true } : {}),
  ...(settings?.botOpponent === true ? { botOpponent: true } : {}),
});

const lobbySettings = (lobby: CustomLobbyState): CustomLobbySettings =>
  lobby.settings ?? defaultLobbySettings();

const lobbyResponse = (
  lobby: CustomLobbyState,
): CreatedCustomLobbyResponse => ({
  lobbyId: lobby.lobbyId,
  ...(lobby.joinCode === undefined ? {} : { joinCode: lobby.joinCode }),
  settings: lobbySettings(lobby),
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

const botSubject = {
  type: "user" as const,
  userId: "bot",
  sessionId: "bot",
  displayName: "Bot",
};

const botDeckSubmission = (): ReadyDeckSubmission => ({
  source: "deckHash",
  hash: "bot-default",
  status: "ready",
  decoded: {
    leader: { cardId: "OP13-079" as CardId, count: 1 },
    main: [{ cardId: "OP13-080" as CardId, count: 50 }],
  },
  donDeckCount: 10,
});

const createLobbyStore = async (
  options: CreateCustomLobbyRegistryOptions,
): Promise<LobbyStore> => {
  if (options.lobbyStore !== undefined) {
    return options.lobbyStore;
  }
  const redisConfig = resolveRedisConfig({
    redisUrl: options.redisUrl,
    redisMode: options.redisMode,
  });
  if (redisConfig.redisUrl !== undefined) {
    return createRedisLobbyStore({
      redis: await createRedisClientForLobbyStore(redisConfig.redisUrl),
    });
  }
  return createMemoryLobbyStore();
};

export const createCustomLobbyRegistry = async (
  matchRegistry: LocalDevMatchRegistry,
  options: CreateCustomLobbyRegistryOptions,
): Promise<CustomLobbyRegistry> => {
  const lobbyStore = await createLobbyStore(options);
  const deckHashCodec = options.deckHashCodec ?? createPoneglyphDeckHashCodec();
  const redisConfig = resolveRedisConfig({
    redisUrl: options.redisUrl,
    redisMode: options.redisMode,
  });
  const sharedCardDataCache: CardDataCache | undefined =
    options.fetchCard === undefined && redisConfig.redisUrl !== undefined
      ? await createRedisCardDataCache({ url: redisConfig.redisUrl })
      : undefined;
  const findSeatForAuth = (
    lobby: CustomLobbyState,
    auth: AuthContext,
  ): CustomLobbySeatState | undefined =>
    Object.values(lobby.seats).find(
      (seat) =>
        seat.subject !== undefined &&
        subjectsOwnSameAccount(seat.subject, auth.subject),
    );
  const claimOpenSeat = (
    lobby: CustomLobbyState,
    auth: AuthContext,
  ): CustomLobbySeatState | "full" => {
    const existing = findSeatForAuth(lobby, auth);
    if (existing !== undefined) {
      existing.subject = {
        ...existing.subject,
        ...auth.subject,
        ...(auth.subject.displayName === undefined
          ? {}
          : { displayName: auth.subject.displayName }),
      };
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
    formatId: string,
  ): Promise<boolean> => {
    try {
      await validateReadyDevDeckSubmission({
        submission,
        createdAt: devLobbyCreatedAt,
        formatId,
        ...(options.fetchCard === undefined
          ? {}
          : { fetchCard: options.fetchCard }),
        ...(options.baseUrl === undefined ? {} : { baseUrl: options.baseUrl }),
        ...(options.redisUrl === undefined
          ? {}
          : { redisUrl: options.redisUrl }),
        ...(options.redisMode === undefined
          ? {}
          : { redisMode: options.redisMode }),
        ...(sharedCardDataCache === undefined
          ? {}
          : {
              cardDataCache: sharedCardDataCache,
              validationCache: sharedCardDataCache,
            }),
      });
      return true;
    } catch {
      return false;
    }
  };
  const validatePendingSubmissions = async (
    pendingSubmissions: readonly {
      readonly index: number;
      readonly loadoutId: string;
      readonly submission: ReadyDeckSubmission;
    }[],
    formatId: string,
    loadouts: ValidatedCustomLobbyLoadout[],
    timingSpans?: LobbyValidationTimingSpan[],
  ): Promise<void> => {
    const validate = async () =>
      await validateReadyDevDeckSubmissions({
        submissions: pendingSubmissions.map((pending) => pending.submission),
        createdAt: devLobbyCreatedAt,
        formatId,
        ...(timingSpans === undefined ? {} : { timingSpans }),
        ...(options.fetchCard === undefined
          ? {}
          : { fetchCard: options.fetchCard }),
        ...(options.baseUrl === undefined ? {} : { baseUrl: options.baseUrl }),
        ...(options.redisUrl === undefined
          ? {}
          : { redisUrl: options.redisUrl }),
        ...(options.redisMode === undefined
          ? {}
          : { redisMode: options.redisMode }),
        ...(sharedCardDataCache === undefined
          ? {}
          : {
              cardDataCache: sharedCardDataCache,
              validationCache: sharedCardDataCache,
            }),
      });
    const validationResults =
      timingSpans === undefined
        ? await validate()
        : await recordLobbyValidationTimingSpan(
            timingSpans,
            "deck-validation",
            validate,
            { count: pendingSubmissions.length },
          );
    for (const [resultIndex, pending] of pendingSubmissions.entries()) {
      const validation = validationResults[resultIndex];
      loadouts[pending.index] =
        validation?.valid === true
          ? {
              loadoutId: pending.loadoutId,
              status: "playable" as const,
              errors: [],
            }
          : {
              loadoutId: pending.loadoutId,
              status: "unplayable" as const,
              errors: ["Resolved loadout is invalid."],
            };
    }
  };
  const ensureMatchWhenReady = async (
    lobby: CustomLobbyState,
  ): Promise<void> => {
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
    const matchId = randomUUID() as MatchId;
    const playerOrder = twoPlayerOrder(lobby.playerOrder);
    const created = await matchRegistry.createMatch(
      await createDevMatchSetupFromDeckSubmissions({
        matchId,
        lobbyId: lobby.lobbyId,
        firstPlayerId: playerOrder[0],
        playerOrder,
        createdAt: devLobbyCreatedAt,
        firstPlayer: first,
        secondPlayer: second,
        formatId: lobbySettings(lobby).formatId,
        ...(options.fetchCard === undefined
          ? {}
          : { fetchCard: options.fetchCard }),
        ...(options.baseUrl === undefined ? {} : { baseUrl: options.baseUrl }),
        ...(options.redisUrl === undefined
          ? {}
          : { redisUrl: options.redisUrl }),
        ...(options.redisMode === undefined
          ? {}
          : { redisMode: options.redisMode }),
        ...(sharedCardDataCache === undefined
          ? {}
          : {
              cardDataCache: sharedCardDataCache,
              validationCache: sharedCardDataCache,
            }),
      }),
      {
        ...(lobbySettings(lobby).botOpponent === true
          ? {
              firstPlayerChoice: {
                source: "game-one-random-chooser",
                chooserPlayerId: playerOrder[0],
              },
            }
          : lobby.firstPlayerChoice === undefined
            ? {}
            : { firstPlayerChoice: lobby.firstPlayerChoice }),
        seats: matchSeatsWithMatchId(lobby.seats, matchId),
        timersEnabled: lobbySettings(lobby).timerDisabled !== true,
        ...(lobbySettings(lobby).botOpponent === true
          ? { botPlayerIds: [playerOrder[1]] }
          : {}),
      },
    );
    lobby.matchId = created.matchId;
    await lobbyStore.setLobbyMatchId(lobby.lobbyId, created.matchId);
  };
  const pendingRematchVotes = new Map<MatchId, Set<PlayerId>>();
  const joinLobbyById = async (
    lobbyId: string,
    auth: AuthContext | undefined,
  ): Promise<
    CreatedCustomLobbyResponse | "lobbyNotFound" | "unauthenticated" | "full"
  > => {
    if (auth === undefined) {
      return "unauthenticated";
    }
    return lobbyStore.updateLobby(lobbyId, async (lobby) => {
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
    });
  };

  return {
    async createLobby(settings) {
      const lobbyId = lobbyStore.createLobbyId();
      const joinCode = await lobbyStore.createLobbyJoinCode(lobbyId);
      const createdSettings = createLobbySettings(settings);
      const seats = createDefaultLobbySeats();
      if (createdSettings.botOpponent === true) {
        const botSeat = seats["p2"];
        if (botSeat !== undefined) {
          botSeat.subject = botSubject;
          botSeat.deckSubmission = botDeckSubmission();
        }
      }
      const lobby: CustomLobbyState = {
        lobbyId,
        joinCode,
        settings: createdSettings,
        seats,
      };
      return lobbyResponse(await lobbyStore.createLobby(lobby));
    },
    async joinLobby(lobbyId, auth) {
      return await joinLobbyById(lobbyId, auth);
    },
    async joinLobbyByCode(joinCode, auth) {
      const lobbyId = await lobbyStore.getLobbyIdByJoinCode(joinCode);
      if (lobbyId === undefined) {
        return "lobbyNotFound";
      }
      return await joinLobbyById(lobbyId, auth);
    },
    async submitDeck(lobbyId, auth, deckHash, donDeckCount) {
      if (auth === undefined) {
        return "unauthenticated";
      }
      const submission = await decodeDeckHashSubmission({
        hash: deckHash,
        donDeckCount,
        codec: deckHashCodec,
      });
      if (submission.status !== "ready") {
        return "invalidDeck";
      }
      return lobbyStore.updateLobby(lobbyId, async (lobby) => {
        const seat = findSeatForAuth(lobby, auth);
        if (seat === undefined) {
          return "seatNotFound";
        }
        if (
          !(await validateReadySubmission(
            submission,
            lobbySettings(lobby).formatId,
          ))
        ) {
          return "invalidDeck";
        }
        seat.deckSubmission = submission;
        await ensureMatchWhenReady(lobby);
        return {
          ...lobbyResponse(lobby),
          seat: { playerId: seat.playerId },
        };
      });
    },
    async submitVerifiedLoadout(lobbyId, handoff) {
      const submission = await decodeDeckHashSubmission({
        hash: handoff.resolvedLoadout.mainDeck.hash,
        donDeckCount: handoff.resolvedLoadout.donDeck.count,
        codec: deckHashCodec,
      });
      if (submission.status !== "ready") {
        return "invalidDeck";
      }
      return lobbyStore.updateLobby(lobbyId, async (lobby) => {
        const auth = authFromHandoff(handoff);
        if (
          handoff.claims.lobby_id !== null &&
          handoff.claims.lobby_id !== lobbyId
        ) {
          return "seatNotFound";
        }
        if (
          !(await validateReadySubmission(
            submission,
            lobbySettings(lobby).formatId,
          ))
        ) {
          return "invalidDeck";
        }
        const seat = claimOpenSeat(lobby, auth);
        if (seat === "full") {
          return "full";
        }
        if (
          handoff.claims.seat_id !== null &&
          handoff.claims.seat_id !== String(seat.playerId)
        ) {
          return "seatNotFound";
        }
        seat.deckSubmission = submission;
        seat.verifiedHandoff = handoff;
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
      });
    },
    async validateLoadouts(lobbyId, handoffs, timingSpans) {
      const lobby =
        timingSpans === undefined
          ? await lobbyStore.getLobby(lobbyId)
          : await recordLobbyValidationTimingSpan(
              timingSpans,
              "lobby-load",
              async () => await lobbyStore.getLobby(lobbyId),
            );
      if (lobby === undefined) {
        return "lobbyNotFound";
      }
      const formatId = lobbySettings(lobby).formatId;
      const loadouts: ValidatedCustomLobbyLoadout[] = [];
      const decodedSubmissions = await Promise.all(
        handoffs.map(
          async (
            result,
            index,
          ): Promise<PendingDecodedSubmission | undefined> => {
            if (result.status === "rejected") {
              loadouts[index] = {
                loadoutId: null,
                status: "unverified" as const,
                errors: [result.error],
              };
              return undefined;
            }
            const { handoff } = result;
            if (
              handoff.claims.lobby_id !== null &&
              handoff.claims.lobby_id !== lobbyId
            ) {
              loadouts[index] = {
                loadoutId: handoff.resolvedLoadout.loadoutId,
                status: "unverified" as const,
                errors: ["Sim handoff token is not authorized for this lobby."],
              };
              return undefined;
            }
            let submission;
            try {
              const decode = async () =>
                await decodeDeckHashSubmission({
                  hash: handoff.resolvedLoadout.mainDeck.hash,
                  donDeckCount: handoff.resolvedLoadout.donDeck.count,
                  codec: deckHashCodec,
                });
              submission =
                timingSpans === undefined
                  ? await decode()
                  : await recordLobbyValidationTimingSpan(
                      timingSpans,
                      "deck-hash-decode",
                      decode,
                    );
            } catch {
              loadouts[index] = {
                loadoutId: handoff.resolvedLoadout.loadoutId,
                status: "unplayable" as const,
                errors: ["Resolved loadout is invalid."],
              };
              return undefined;
            }
            if (submission.status !== "ready") {
              loadouts[index] = {
                loadoutId: handoff.resolvedLoadout.loadoutId,
                status: "unplayable" as const,
                errors: ["Resolved loadout is invalid."],
              };
              return undefined;
            }
            return {
              index,
              loadoutId: handoff.resolvedLoadout.loadoutId,
              submission,
            };
          },
        ),
      );
      const pendingSubmissions = decodedSubmissions.filter(
        (submission): submission is PendingDecodedSubmission =>
          submission !== undefined,
      );
      await validatePendingSubmissions(
        pendingSubmissions,
        formatId,
        loadouts,
        timingSpans,
      );
      return { data: { loadouts } };
    },
    async validateDecks(lobbyId, decks, timingSpans) {
      const lobby =
        timingSpans === undefined
          ? await lobbyStore.getLobby(lobbyId)
          : await recordLobbyValidationTimingSpan(
              timingSpans,
              "lobby-load",
              async () => await lobbyStore.getLobby(lobbyId),
            );
      if (lobby === undefined) {
        return "lobbyNotFound";
      }
      const loadouts: ValidatedCustomLobbyLoadout[] = [];
      const decodedSubmissions = await Promise.all(
        decks.map(
          async (
            deck,
            index,
          ): Promise<PendingDecodedSubmission | undefined> => {
            const decode = async () =>
              await decodeDeckHashSubmission({
                hash: deck.deckHash,
                donDeckCount: deck.donDeckCount,
                codec: deckHashCodec,
              });
            const submission =
              timingSpans === undefined
                ? await decode()
                : await recordLobbyValidationTimingSpan(
                    timingSpans,
                    "deck-hash-decode",
                    decode,
                  );
            if (submission.status !== "ready") {
              loadouts[index] = {
                loadoutId: deck.loadoutId,
                status: "unplayable" as const,
                errors: ["Deck hash is invalid."],
              };
              return undefined;
            }
            return {
              index,
              loadoutId: deck.loadoutId,
              submission,
            };
          },
        ),
      );
      const pendingSubmissions = decodedSubmissions.filter(
        (submission): submission is PendingDecodedSubmission =>
          submission !== undefined,
      );
      await validatePendingSubmissions(
        pendingSubmissions,
        lobbySettings(lobby).formatId,
        loadouts,
        timingSpans,
      );
      return { data: { loadouts } };
    },
    async getLobby(lobbyId) {
      const lobby = await lobbyStore.getLobby(lobbyId);
      return lobby === undefined ? undefined : lobbyResponse(lobby);
    },
    async authorizeSeat(auth, lobbyId, playerId) {
      if (auth === undefined) {
        return "unauthenticated";
      }
      const lobby = await lobbyStore.getLobby(lobbyId);
      if (lobby === undefined) {
        return "lobbyNotFound";
      }
      const seat = lobby.seats[String(playerId)];
      if (
        seat?.subject === undefined ||
        !subjectsOwnSameAccount(seat.subject, auth.subject)
      ) {
        return "forbidden";
      }
      return "authorized";
    },
    async createRematchLobby(sourceMatchId, playerId, auth) {
      const seed = matchRegistry.createRematchSeed(
        sourceMatchId,
        playerId,
        auth,
      );
      if (typeof seed === "string") {
        return seed;
      }
      const votes =
        pendingRematchVotes.get(sourceMatchId) ?? new Set<PlayerId>();
      votes.add(playerId);
      pendingRematchVotes.set(sourceMatchId, votes);
      if (votes.size < 2) {
        return { rematch: { status: "pending" } };
      }
      pendingRematchVotes.delete(sourceMatchId);
      const playerOrder = twoPlayerOrder(seed.playerOrder);
      const sourceLobbyId = await lobbyStore.getLobbyIdByMatchId(sourceMatchId);
      const sourceLobby =
        sourceLobbyId === undefined
          ? undefined
          : await lobbyStore.getLobby(sourceLobbyId);
      const joinCode = sourceLobby?.joinCode;
      const lobby: CustomLobbyState = {
        lobbyId: `rematch-${lobbyStore.createLobbyId()}`,
        ...(joinCode === undefined ? {} : { joinCode }),
        settings: createLobbySettings(sourceLobby?.settings),
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
        rematchOfMatchId: sourceMatchId,
      };
      await lobbyStore.createLobby(lobby);
      if (joinCode !== undefined) {
        await lobbyStore.setLobbyJoinCode(lobby.lobbyId, joinCode);
      }
      return {
        ...lobbyResponse(lobby),
        seat: { playerId },
      };
    },
    cancelRematchConsensusForMatch(sourceMatchId) {
      return pendingRematchVotes.delete(sourceMatchId);
    },
    async cancelRematchLobby(lobbyId) {
      const lobby = await lobbyStore.getLobby(lobbyId);
      if (
        lobby?.rematchOfMatchId === undefined ||
        lobby.matchId !== undefined
      ) {
        return false;
      }
      return lobbyStore.deleteLobby(lobbyId);
    },
  };
};
