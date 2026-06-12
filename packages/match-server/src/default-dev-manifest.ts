import { randomUUID } from "node:crypto";
import {
  createRedisCardDataCache,
  fetchDevPoneglyphCatalogSnapshot,
  type CardDataCache,
  type DevManifestVersions,
} from "@optcg/cards";
import {
  buildDevMatchCardManifestFromPoneglyphIds,
  type DevPoneglyphFetch,
} from "@optcg/card-support";
import type { CardId, PlayerId, VariantKey } from "@optcg/types";

import {
  type DeckSubmission,
  type ReadyDeckSubmission,
} from "./deck-submission.js";
import {
  validateDeckLoadout,
  type DeckValidationCachePort,
  type ExplicitDonDeckSubmission,
} from "./deck-validation.js";
import type { DevMatchPlayerSetup, DevMatchSetup } from "./local-match.js";
import {
  recordLobbyValidationTimingSpan,
  type LobbyValidationTimingSpan,
} from "./lobby-validation-timing-log.js";
import { resolveRedisConfig, type RedisMode } from "./redis-config.js";
import { writeActiveSimCardCacheVersions } from "./sim-card-cache-versions.js";

interface CreateDefaultDevMatchSetupInput {
  readonly matchId: DevMatchSetup["matchId"];
  readonly firstPlayerId: PlayerId;
  readonly playerOrder: readonly [PlayerId, PlayerId];
  readonly createdAt: string;
  readonly formatId?: string;
  readonly lobbyId?: string;
  readonly fetchCard?: DevPoneglyphFetch;
  readonly baseUrl?: string;
  readonly redisUrl?: string;
  readonly redisMode?: RedisMode;
  readonly cardDataCache?: CardDataCache;
  readonly validationCache?: DeckValidationCachePort;
}

export interface CreateDevMatchSetupFromDeckSubmissionsInput extends CreateDefaultDevMatchSetupInput {
  readonly firstPlayer: ReadyDeckSubmission;
  readonly secondPlayer: ReadyDeckSubmission;
}

export interface ValidateReadyDevDeckSubmissionInput extends Omit<
  CreateDefaultDevMatchSetupInput,
  "matchId" | "firstPlayerId" | "playerOrder"
> {
  readonly submission: ReadyDeckSubmission;
  readonly timingSpans?: LobbyValidationTimingSpan[];
}

export interface ValidateReadyDevDeckSubmissionsInput extends Omit<
  ValidateReadyDevDeckSubmissionInput,
  "submission"
> {
  readonly submissions: readonly ReadyDeckSubmission[];
}

export interface ReadyDeckSubmissionValidationResult {
  readonly valid: boolean;
  readonly error?: string;
}

export interface DevDonCounts {
  readonly firstPlayer: number;
  readonly secondPlayer: number;
}

export interface DevDeckCardEntry {
  readonly cardId: CardId;
  readonly count: number;
  readonly variantIndex?: number;
}

export interface DevDecklist {
  readonly leader: DevDeckCardEntry;
  readonly deckEntries: readonly DevDeckCardEntry[];
  readonly donDeckCount: number;
}

interface DevManifestForDeckSubmission {
  readonly cards: Partial<
    Record<
      CardId,
      {
        readonly category?: string;
        readonly life?: number;
        readonly variants?: readonly {
          readonly variantIndex: number;
          readonly variantKey?: VariantKey;
        }[];
      }
    >
  >;
}

export const createDevDeckCardIds = (
  entries: readonly DevDeckCardEntry[],
): CardId[] =>
  entries.flatMap((entry) =>
    Array.from({ length: entry.count }, () => entry.cardId),
  );

export const createDevDeckVariantIndexes = (
  entries: readonly DevDeckCardEntry[],
): Array<number | undefined> =>
  entries.flatMap((entry) =>
    Array.from({ length: entry.count }, () => entry.variantIndex),
  );

export const createDevManifestCardIds = (
  ...decklists: readonly DevDecklist[]
): CardId[] => {
  const cardIds = decklists.flatMap((decklist) => [
    decklist.leader.cardId,
    ...decklist.deckEntries.map((entry) => entry.cardId),
  ]);
  return [...new Set(cardIds)];
};

export const createDevDecklistFromSubmission = (
  submission: DeckSubmission,
): DevDecklist => {
  if (submission.status !== "ready") {
    throw new TypeError("Dev match setup requires a ready deck submission.");
  }
  return {
    leader: submission.decoded.leader,
    deckEntries: submission.decoded.main,
    donDeckCount: submission.donDeckCount,
  };
};

export const createDevDonDeckCardIds = (count: number): CardId[] =>
  Array.from(
    { length: count },
    (_, index) => `dev-don-${String(index + 1)}` as CardId,
  );

export const defaultDevDonCounts: DevDonCounts = {
  firstPlayer: 10,
  secondPlayer: 10,
};

export const defaultDevEffectDefinitionsVersion = "generated-dev-v14";
const defaultDevDeckValidatorVersion = "dev-deck-validator-v3";
export const defaultDevDeckFormatId = "sandbox-open";
const defaultDevCatalogVersionsTtlMs = 60_000;

let cachedLiveDevCatalogVersions:
  | {
      readonly baseUrl: string | undefined;
      readonly effectDefinitionsVersion: string;
      readonly expiresAtMs: number;
      readonly versions: DevManifestVersions;
    }
  | undefined;

const defaultDevLeader: DevDeckCardEntry = {
  cardId: "OP13-079" as CardId,
  count: 1,
};

const defaultDevMainDeckEntries: readonly DevDeckCardEntry[] = [
  { cardId: "OP13-080" as CardId, count: 7 },
  { cardId: "OP13-082" as CardId, count: 7 },
  { cardId: "OP13-083" as CardId, count: 6 },
  { cardId: "OP13-084" as CardId, count: 6 },
  { cardId: "OP13-086" as CardId, count: 6 },
  { cardId: "OP13-089" as CardId, count: 6 },
  { cardId: "OP13-091" as CardId, count: 6 },
  { cardId: "OP13-099" as CardId, count: 6 },
];

const createDefaultDevDecklist = (donDeckCount: number): DevDecklist => ({
  leader: defaultDevLeader,
  deckEntries: defaultDevMainDeckEntries,
  donDeckCount,
});

const assertValidDevDonCount = (value: number, label: string): number => {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return value;
};

export const resolveDevDonCounts = (
  input: DevDonCounts,
): readonly [number, number] => [
  assertValidDevDonCount(input.firstPlayer, "deck1 DON deck count"),
  assertValidDevDonCount(input.secondPlayer, "deck2 DON deck count"),
];

export const createDevRngSeed = (): string => `dev-local-${randomUUID()}`;

export const createDevPlayerSetupFromDecklist = (
  playerId: PlayerId,
  decklist: DevDecklist,
  manifest: DevManifestForDeckSubmission,
  donDeckCardIds: CardId[],
): DevMatchPlayerSetup => {
  const leader = manifest.cards[decklist.leader.cardId];
  if (leader?.category !== "leader") {
    throw new Error(
      `Dev decklist leader ${String(decklist.leader.cardId)} must resolve to a Leader card.`,
    );
  }
  const leaderLife = leader.life;
  if (
    typeof leaderLife !== "number" ||
    !Number.isInteger(leaderLife) ||
    leaderLife < 0
  ) {
    throw new Error(
      `Dev decklist leader ${String(decklist.leader.cardId)} must have a life count.`,
    );
  }
  return {
    playerId,
    leaderCardId: decklist.leader.cardId,
    leaderLifeCount: leaderLife,
    ...(decklist.leader.variantIndex === undefined
      ? {}
      : { leaderVariantIndex: decklist.leader.variantIndex }),
    deckCardIds: createDevDeckCardIds(decklist.deckEntries),
    deckVariantIndexes: createDevDeckVariantIndexes(decklist.deckEntries),
    donDeckCardIds,
  };
};

const createExplicitDevDonDeckSubmission = (
  count: number,
): ExplicitDonDeckSubmission => ({
  source: "explicit",
  entries: createDevDonDeckCardIds(count).map((cardId) => ({
    cardId,
    count: 1,
  })),
});

const recordDevDeckValidationTimingSpan = async <T>(
  timingSpans: LobbyValidationTimingSpan[] | undefined,
  name: string,
  fn: () => T | Promise<T>,
  options: { readonly count?: number } = {},
): Promise<T> =>
  timingSpans === undefined
    ? await fn()
    : await recordLobbyValidationTimingSpan(
        timingSpans,
        name,
        async () => await fn(),
        options,
      );

export const validateAndAdaptDevDecklist = async ({
  decklist,
  cardManifest,
  formatId = defaultDevDeckFormatId,
  validationCache,
}: {
  readonly decklist: DevDecklist;
  readonly cardManifest: Awaited<
    ReturnType<typeof buildDevMatchCardManifestFromPoneglyphIds>
  >;
  readonly formatId?: string;
  readonly validationCache?: DeckValidationCachePort;
}): Promise<DevDecklist> => {
  const validation = await validateDeckLoadout({
    formatId,
    mainDeck: {
      source: "deckHash",
      hash: "dev-decklist",
      status: "ready",
      decoded: {
        leader: decklist.leader,
        main: decklist.deckEntries,
      },
      donDeckCount: decklist.donDeckCount,
    },
    donDeck: createExplicitDevDonDeckSubmission(decklist.donDeckCount),
    cards: cardManifest.cards,
    versions: {
      validatorVersion: defaultDevDeckValidatorVersion,
      cardDataVersion: cardManifest.cardDataVersion,
      effectDefinitionsVersion: cardManifest.effectDefinitionsVersion,
      overlayVersion: "dev-overlay-v1",
      banlistVersion: cardManifest.banlistVersion,
      rulesVersion: "dev-rules-v1",
    },
    ...(validationCache === undefined ? {} : { cache: validationCache }),
  });
  if (!validation.valid) {
    throw new Error(
      `Dev decklist failed validation: ${validation.errors
        .map((error) => error.message)
        .join("; ")}`,
    );
  }
  return {
    ...decklist,
    donDeckCount: validation.matchDonDeck.cards.length,
  };
};

export const validateDevDeckSubmissionVariants = (
  decklist: DevDecklist,
  manifest: DevManifestForDeckSubmission,
): void => {
  for (const entry of [decklist.leader, ...decklist.deckEntries]) {
    if (entry.variantIndex === undefined) {
      continue;
    }
    const variants = manifest.cards[entry.cardId]?.variants ?? [];
    if (
      !variants.some((variant) => variant.variantIndex === entry.variantIndex)
    ) {
      throw new TypeError(
        `Deck hash requested variant ${String(entry.variantIndex)} is not available for ${String(entry.cardId)}.`,
      );
    }
  }
};

export const validateReadyDevDeckSubmission = async (
  input: ValidateReadyDevDeckSubmissionInput,
): Promise<void> => {
  const [result] = await validateReadyDevDeckSubmissions({
    ...input,
    submissions: [input.submission],
  });
  if (result?.valid !== true) {
    throw new Error(result?.error ?? "Dev decklist failed validation.");
  }
};

export const validateReadyDevDeckSubmissions = async (
  input: ValidateReadyDevDeckSubmissionsInput,
): Promise<readonly ReadyDeckSubmissionValidationResult[]> => {
  const decklists = await recordDevDeckValidationTimingSpan(
    input.timingSpans,
    "deck-validation:create-decklists",
    () =>
      input.submissions.map((submission) =>
        createDevDecklistFromSubmission(submission),
      ),
    { count: input.submissions.length },
  );
  if (decklists.length === 0) {
    return [];
  }
  try {
    const devDonCount = Math.max(
      ...decklists.map((decklist) => decklist.donDeckCount),
    );
    const manifestCardIds = createDevManifestCardIds(...decklists);
    const cardManifest = await recordDevDeckValidationTimingSpan(
      input.timingSpans,
      "deck-validation:manifest-build",
      async () =>
        await buildDevManifestFromCardIds(
          manifestCardIds,
          {
            matchId: "validation-only" as DevMatchSetup["matchId"],
            firstPlayerId: "p1" as PlayerId,
            playerOrder: ["p1" as PlayerId, "p2" as PlayerId],
            createdAt: input.createdAt,
            ...(input.fetchCard === undefined
              ? {}
              : { fetchCard: input.fetchCard }),
            ...(input.baseUrl === undefined ? {} : { baseUrl: input.baseUrl }),
            ...(input.redisUrl === undefined
              ? {}
              : { redisUrl: input.redisUrl }),
            ...(input.redisMode === undefined
              ? {}
              : { redisMode: input.redisMode }),
            ...(input.cardDataCache === undefined
              ? {}
              : { cardDataCache: input.cardDataCache }),
            ...(input.validationCache === undefined
              ? {}
              : { validationCache: input.validationCache }),
          },
          devDonCount,
        ),
      { count: manifestCardIds.length },
    );
    const validationCache = await recordDevDeckValidationTimingSpan(
      input.timingSpans,
      "deck-validation:validation-cache",
      async () =>
        input.validationCache ?? (await createRequestScopedRedisCache(input)),
    );
    return await Promise.all(
      decklists.map(async (decklist) => {
        try {
          await recordDevDeckValidationTimingSpan(
            input.timingSpans,
            "deck-validation:variants",
            () => {
              validateDevDeckSubmissionVariants(decklist, cardManifest);
            },
            { count: 1 },
          );
          const adaptedDecklist = await recordDevDeckValidationTimingSpan(
            input.timingSpans,
            "deck-validation:adapt",
            async () =>
              await validateAndAdaptDevDecklist({
                decklist,
                cardManifest,
                ...(input.formatId === undefined
                  ? {}
                  : { formatId: input.formatId }),
                ...(validationCache === undefined ? {} : { validationCache }),
              }),
            { count: 1 },
          );
          await recordDevDeckValidationTimingSpan(
            input.timingSpans,
            "deck-validation:player-setup",
            () =>
              createDevPlayerSetupFromDecklist(
                "p1" as PlayerId,
                adaptedDecklist,
                cardManifest,
                createDevDonDeckCardIds(adaptedDecklist.donDeckCount),
              ),
            { count: 1 },
          );
          return { valid: true };
        } catch (error: unknown) {
          return {
            valid: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }),
    );
  } catch {
    return await Promise.all(
      input.submissions.map(async (submission) => {
        try {
          await validateReadyDevDeckSubmissionUnbatched({
            ...input,
            submission,
          });
          return { valid: true };
        } catch (error: unknown) {
          return {
            valid: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }),
    );
  }
};

const validateReadyDevDeckSubmissionUnbatched = async (
  input: ValidateReadyDevDeckSubmissionInput,
): Promise<void> => {
  const decklist = await recordDevDeckValidationTimingSpan(
    input.timingSpans,
    "deck-validation:unbatched:create-decklist",
    () => createDevDecklistFromSubmission(input.submission),
    { count: 1 },
  );
  const manifestCardIds = createDevManifestCardIds(decklist);
  const cardManifest = await recordDevDeckValidationTimingSpan(
    input.timingSpans,
    "deck-validation:unbatched:manifest-build",
    async () =>
      await buildDevManifestFromCardIds(
        manifestCardIds,
        {
          matchId: "validation-only" as DevMatchSetup["matchId"],
          firstPlayerId: "p1" as PlayerId,
          playerOrder: ["p1" as PlayerId, "p2" as PlayerId],
          createdAt: input.createdAt,
          ...(input.fetchCard === undefined
            ? {}
            : { fetchCard: input.fetchCard }),
          ...(input.baseUrl === undefined ? {} : { baseUrl: input.baseUrl }),
          ...(input.redisUrl === undefined ? {} : { redisUrl: input.redisUrl }),
          ...(input.redisMode === undefined
            ? {}
            : { redisMode: input.redisMode }),
          ...(input.cardDataCache === undefined
            ? {}
            : { cardDataCache: input.cardDataCache }),
          ...(input.validationCache === undefined
            ? {}
            : { validationCache: input.validationCache }),
        },
        decklist.donDeckCount,
      ),
    { count: manifestCardIds.length },
  );
  const validationCache = await recordDevDeckValidationTimingSpan(
    input.timingSpans,
    "deck-validation:unbatched:validation-cache",
    async () =>
      input.validationCache ?? (await createRequestScopedRedisCache(input)),
  );
  await recordDevDeckValidationTimingSpan(
    input.timingSpans,
    "deck-validation:unbatched:variants",
    () => {
      validateDevDeckSubmissionVariants(decklist, cardManifest);
    },
    { count: 1 },
  );
  const adaptedDecklist = await recordDevDeckValidationTimingSpan(
    input.timingSpans,
    "deck-validation:unbatched:adapt",
    async () =>
      await validateAndAdaptDevDecklist({
        decklist,
        cardManifest,
        ...(input.formatId === undefined ? {} : { formatId: input.formatId }),
        ...(validationCache === undefined ? {} : { validationCache }),
      }),
    { count: 1 },
  );
  await recordDevDeckValidationTimingSpan(
    input.timingSpans,
    "deck-validation:unbatched:player-setup",
    () =>
      createDevPlayerSetupFromDecklist(
        "p1" as PlayerId,
        adaptedDecklist,
        cardManifest,
        createDevDonDeckCardIds(adaptedDecklist.donDeckCount),
      ),
    { count: 1 },
  );
};

const buildDevManifestFromCardIds = async (
  cardIds: readonly CardId[],
  input: CreateDefaultDevMatchSetupInput,
  devDonCount: number,
) => {
  const cache =
    input.cardDataCache ?? (await createRequestScopedRedisCache(input));
  const versions =
    input.fetchCard === undefined
      ? await resolveLiveDevCatalogVersions(input)
      : {
          cardDataVersion: "live-poneglyph-dev-v1",
          effectDefinitionsVersion: defaultDevEffectDefinitionsVersion,
          overlayVersion: "none",
        };
  if (cache !== undefined && input.fetchCard === undefined) {
    await writeActiveSimCardCacheVersions(cache, versions);
  }
  return await buildDevMatchCardManifestFromPoneglyphIds({
    cardIds,
    createdAt: input.createdAt,
    devDonCount,
    versions,
    ...(cache === undefined ? {} : { cache }),
    ...(input.fetchCard === undefined ? {} : { fetchCard: input.fetchCard }),
    ...(input.baseUrl === undefined ? {} : { baseUrl: input.baseUrl }),
  });
};

const createRequestScopedRedisCache = async (
  input: Pick<
    CreateDefaultDevMatchSetupInput,
    "fetchCard" | "redisMode" | "redisUrl"
  >,
): Promise<CardDataCache | undefined> => {
  const redisConfig = resolveRedisConfig({
    redisUrl: input.redisUrl,
    redisMode: input.redisMode,
  });
  return input.fetchCard === undefined && redisConfig.redisUrl !== undefined
    ? await createRedisCardDataCache({ url: redisConfig.redisUrl })
    : undefined;
};

const resolveLiveDevCatalogVersions = async (
  input: Pick<CreateDefaultDevMatchSetupInput, "baseUrl">,
): Promise<DevManifestVersions> => {
  const now = Date.now();
  if (
    cachedLiveDevCatalogVersions !== undefined &&
    cachedLiveDevCatalogVersions.baseUrl === input.baseUrl &&
    cachedLiveDevCatalogVersions.effectDefinitionsVersion ===
      defaultDevEffectDefinitionsVersion &&
    cachedLiveDevCatalogVersions.expiresAtMs > now
  ) {
    return cachedLiveDevCatalogVersions.versions;
  }

  const snapshot = await fetchDevPoneglyphCatalogSnapshot({
    ...(input.baseUrl === undefined ? {} : { baseUrl: input.baseUrl }),
    versions: {
      effectDefinitionsVersion: defaultDevEffectDefinitionsVersion,
    },
  });
  cachedLiveDevCatalogVersions = {
    baseUrl: input.baseUrl,
    effectDefinitionsVersion: defaultDevEffectDefinitionsVersion,
    expiresAtMs: now + defaultDevCatalogVersionsTtlMs,
    versions: snapshot.versions,
  };
  return snapshot.versions;
};

const createDevMatchSetupFromDecklists = ({
  input,
  firstPlayerDecklist,
  secondPlayerDecklist,
  cardManifest,
}: {
  readonly input: CreateDefaultDevMatchSetupInput;
  readonly firstPlayerDecklist: DevDecklist;
  readonly secondPlayerDecklist: DevDecklist;
  readonly cardManifest: Awaited<
    ReturnType<typeof buildDevMatchCardManifestFromPoneglyphIds>
  >;
}): DevMatchSetup => {
  const firstPlayerDonDeck = createDevDonDeckCardIds(
    firstPlayerDecklist.donDeckCount,
  );
  const secondPlayerDonDeck = createDevDonDeckCardIds(
    secondPlayerDecklist.donDeckCount,
  );
  return {
    matchId: input.matchId,
    firstPlayerId: input.firstPlayerId,
    rngSeed: createDevRngSeed(),
    playerOrder: input.playerOrder,
    players: [
      createDevPlayerSetupFromDecklist(
        input.playerOrder[0],
        firstPlayerDecklist,
        cardManifest,
        firstPlayerDonDeck,
      ),
      createDevPlayerSetupFromDecklist(
        input.playerOrder[1],
        secondPlayerDecklist,
        cardManifest,
        secondPlayerDonDeck,
      ),
    ],
    cardManifest,
    ...(input.lobbyId === undefined ? {} : { lobbyId: input.lobbyId }),
    shuffleDecks: true,
  };
};

export const createDevMatchSetupFromDeckSubmissions = async (
  input: CreateDevMatchSetupFromDeckSubmissionsInput,
): Promise<DevMatchSetup> => {
  return await createValidatedDevMatchSetupFromDecklists({
    input,
    firstPlayerDecklist: createDevDecklistFromSubmission(input.firstPlayer),
    secondPlayerDecklist: createDevDecklistFromSubmission(input.secondPlayer),
  });
};

const createValidatedDevMatchSetupFromDecklists = async ({
  input,
  firstPlayerDecklist,
  secondPlayerDecklist,
}: {
  readonly input: CreateDefaultDevMatchSetupInput;
  readonly firstPlayerDecklist: DevDecklist;
  readonly secondPlayerDecklist: DevDecklist;
}): Promise<DevMatchSetup> => {
  const devDonCount = Math.max(
    firstPlayerDecklist.donDeckCount,
    secondPlayerDecklist.donDeckCount,
  );
  const cardManifest = await buildDevManifestFromCardIds(
    createDevManifestCardIds(firstPlayerDecklist, secondPlayerDecklist),
    input,
    devDonCount,
  );
  const validationCache =
    input.validationCache ?? (await createRequestScopedRedisCache(input));
  validateDevDeckSubmissionVariants(firstPlayerDecklist, cardManifest);
  validateDevDeckSubmissionVariants(secondPlayerDecklist, cardManifest);
  const adaptedFirstPlayerDecklist = await validateAndAdaptDevDecklist({
    decklist: firstPlayerDecklist,
    cardManifest,
    ...(input.formatId === undefined ? {} : { formatId: input.formatId }),
    ...(validationCache === undefined ? {} : { validationCache }),
  });
  const adaptedSecondPlayerDecklist = await validateAndAdaptDevDecklist({
    decklist: secondPlayerDecklist,
    cardManifest,
    ...(input.formatId === undefined ? {} : { formatId: input.formatId }),
    ...(validationCache === undefined ? {} : { validationCache }),
  });
  return createDevMatchSetupFromDecklists({
    input,
    firstPlayerDecklist: adaptedFirstPlayerDecklist,
    secondPlayerDecklist: adaptedSecondPlayerDecklist,
    cardManifest,
  });
};

export const createDefaultDevMatchSetup = async (
  input: CreateDefaultDevMatchSetupInput,
): Promise<DevMatchSetup> => {
  const [firstPlayerDonCount, secondPlayerDonCount] =
    resolveDevDonCounts(defaultDevDonCounts);
  return await createValidatedDevMatchSetupFromDecklists({
    input,
    firstPlayerDecklist: createDefaultDevDecklist(firstPlayerDonCount),
    secondPlayerDecklist: createDefaultDevDecklist(secondPlayerDonCount),
  });
};
