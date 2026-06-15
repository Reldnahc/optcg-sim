import { createHash } from "node:crypto";
import type { CardId, ResolvedCard } from "@optcg/types";

import type { ReadyDeckSubmission } from "./deck-submission.js";

export interface DeckValidationCachePort {
  readonly getJson: (key: string) => Promise<unknown>;
  readonly setJson: (key: string, value: unknown) => Promise<void>;
}

export interface DonDeckSubmissionEntry {
  readonly cardId: CardId;
  readonly count: number;
  readonly variantIndex?: number;
}

export interface ExplicitDonDeckSubmission {
  readonly source: "explicit";
  readonly entries: readonly DonDeckSubmissionEntry[];
}

export interface DeckValidationVersions {
  readonly validatorVersion: string;
  readonly cardDataVersion: string;
  readonly effectDefinitionsVersion: string;
  readonly overlayVersion: string;
  readonly banlistVersion: string;
  readonly rulesVersion: string;
}

export interface DeckValidationInput {
  readonly formatId: string;
  readonly mainDeck: ReadyDeckSubmission;
  readonly donDeck: ExplicitDonDeckSubmission;
  readonly cards: Partial<Record<CardId, ResolvedCard>>;
  readonly versions: DeckValidationVersions;
  readonly cache?: DeckValidationCachePort;
}

export interface NormalizedDeckLoadoutIdentity {
  readonly formatId: string;
  readonly leader: { readonly cardId: CardId; readonly count: 1 };
  readonly main: readonly { readonly cardId: CardId; readonly count: number }[];
  readonly donDeck: readonly CardId[];
}

export interface NormalizedDeckLoadout {
  readonly identity: NormalizedDeckLoadoutIdentity;
  readonly digest: string;
}

export type AppliedDeckRule =
  | {
      readonly type: "donDeckSize";
      readonly sourceCardId: CardId;
      readonly count: number;
    }
  | {
      readonly type: "excludeEventCostGte";
      readonly sourceCardId: CardId;
      readonly cost: number;
    }
  | {
      readonly type: "anyCopiesOfThisCard";
      readonly sourceCardId: CardId;
    };

export interface DeckValidationError {
  readonly code:
    | "missingCard"
    | "invalidLeader"
    | "invalidVariant"
    | "invalidDonDeck"
    | "invalidMainDeckSize"
    | "donDeckTooShort"
    | "deckRuleViolation"
    | "formatIllegal"
    | "unsupportedCard";
  readonly message: string;
  readonly cardId?: CardId;
}

export interface ValidatedDonDeck {
  readonly cards: readonly CardId[];
}

export type DeckValidationResult =
  | {
      readonly valid: true;
      readonly normalizedDeckDigest: string;
      readonly cacheStatus: "hit" | "miss" | "none";
      readonly requestedDonDeck: ValidatedDonDeck;
      readonly matchDonDeck: ValidatedDonDeck;
      readonly constructionRules: readonly AppliedDeckRule[];
      readonly errors: readonly [];
      readonly warnings: readonly string[];
    }
  | {
      readonly valid: false;
      readonly normalizedDeckDigest: string;
      readonly cacheStatus: "hit" | "miss" | "none";
      readonly requestedDonDeck: ValidatedDonDeck;
      readonly matchDonDeck: ValidatedDonDeck;
      readonly constructionRules: readonly AppliedDeckRule[];
      readonly errors: readonly DeckValidationError[];
      readonly warnings: readonly string[];
    };

interface CachedDeckValidationResult {
  readonly cacheSchemaVersion: 1;
  readonly result: DeckValidationResult;
}

const cacheSchemaVersion = 1;
const requiredMainDeckSize = 50;
const defaultDonDeckSize = 10;

export const normalizeDeckLoadoutIdentity = (
  input: DeckValidationInput,
): NormalizedDeckLoadout => {
  const identity: NormalizedDeckLoadoutIdentity = {
    formatId: input.formatId,
    leader: {
      cardId: input.mainDeck.decoded.leader.cardId,
      count: 1,
    },
    main: normalizeCountedEntries(input.mainDeck.decoded.main),
    donDeck: expandDonDeck(input.donDeck.entries),
  };
  return {
    identity,
    digest: sha256(identity),
  };
};

export const createDeckValidationCacheKey = ({
  digest,
  formatId,
  versions,
}: {
  readonly digest: string;
  readonly formatId: string;
  readonly versions: DeckValidationVersions;
}): string =>
  [
    "deck-validation",
    versions.validatorVersion,
    versions.cardDataVersion,
    versions.effectDefinitionsVersion,
    versions.overlayVersion,
    versions.banlistVersion,
    versions.rulesVersion,
    formatId,
    digest,
  ].join(":");

export const validateDeckLoadout = async (
  input: DeckValidationInput,
): Promise<DeckValidationResult> => {
  const normalized = normalizeDeckLoadoutIdentity(input);
  const requestedDonDeck = { cards: normalized.identity.donDeck };
  const variantErrors = validateRequestedVariants(input);
  if (variantErrors.length > 0) {
    return invalidResult({
      normalizedDeckDigest: normalized.digest,
      cacheStatus: "none",
      requestedDonDeck,
      matchDonDeck: requestedDonDeck,
      constructionRules: [],
      errors: variantErrors,
    });
  }

  const cacheKey =
    input.cache === undefined
      ? undefined
      : createDeckValidationCacheKey({
          digest: normalized.digest,
          formatId: input.formatId,
          versions: input.versions,
        });
  if (input.cache !== undefined && cacheKey !== undefined) {
    const cached = await input.cache.getJson(cacheKey);
    if (isCachedDeckValidationResult(cached)) {
      return {
        ...cached.result,
        cacheStatus: "hit",
      };
    }
  }

  const result = runDeckValidation(input, normalized, requestedDonDeck);
  if (input.cache !== undefined && cacheKey !== undefined) {
    await input.cache.setJson(cacheKey, {
      cacheSchemaVersion,
      result,
    });
  }
  return result;
};

const runDeckValidation = (
  input: DeckValidationInput,
  normalized: NormalizedDeckLoadout,
  requestedDonDeck: ValidatedDonDeck,
): DeckValidationResult => {
  const errors: DeckValidationError[] = [];
  const leaderCount = input.mainDeck.decoded.leader.count;
  if (leaderCount !== 1) {
    errors.push({
      code: "invalidLeader",
      message: `Deck must contain exactly 1 leader, but found ${String(leaderCount)}.`,
      cardId: input.mainDeck.decoded.leader.cardId,
    });
  }

  const mainDeckSize = input.mainDeck.decoded.main.reduce(
    (total, entry) => total + entry.count,
    0,
  );
  if (mainDeckSize !== requiredMainDeckSize) {
    errors.push({
      code: "invalidMainDeckSize",
      message: `Main deck has ${String(mainDeckSize)} cards, but must contain exactly ${String(requiredMainDeckSize)} cards.`,
    });
  }

  const leader = input.cards[input.mainDeck.decoded.leader.cardId];
  if (leader === undefined) {
    errors.push({
      code: "missingCard",
      message: `Leader ${String(input.mainDeck.decoded.leader.cardId)} is missing from resolved card data.`,
      cardId: input.mainDeck.decoded.leader.cardId,
    });
  } else if (leader.category !== "leader" || leader.life === undefined) {
    errors.push({
      code: "invalidLeader",
      message: `Deck leader ${String(leader.cardId)} must be a Leader card with a life count.`,
      cardId: leader.cardId,
    });
  }

  for (const cardId of [
    ...input.mainDeck.decoded.main.map((entry) => entry.cardId),
    ...requestedDonDeck.cards,
  ]) {
    if (input.cards[cardId] === undefined) {
      errors.push({
        code: "missingCard",
        message: `Card ${String(cardId)} is missing from resolved card data.`,
        cardId,
      });
    }
  }

  const constructionRules = extractSubmittedDeckConstructionRules(
    input,
    leader,
  );
  const requiredDonDeckSize =
    constructionRules.find((rule) => rule.type === "donDeckSize")?.count ??
    defaultDonDeckSize;
  const matchDonDeck = {
    cards: requestedDonDeck.cards.slice(0, requiredDonDeckSize),
  };

  if (requestedDonDeck.cards.length < requiredDonDeckSize) {
    errors.push({
      code: "donDeckTooShort",
      message: `DON deck has ${String(requestedDonDeck.cards.length)} cards, but this loadout requires ${String(requiredDonDeckSize)}.`,
    });
  }

  for (const rule of constructionRules) {
    if (rule.type !== "excludeEventCostGte") {
      continue;
    }
    for (const entry of input.mainDeck.decoded.main) {
      const resolved = input.cards[entry.cardId];
      if (
        resolved?.category === "event" &&
        resolved.cost !== undefined &&
        resolved.cost >= rule.cost
      ) {
        errors.push({
          code: "deckRuleViolation",
          message: `Deck rule from ${String(rule.sourceCardId)} excludes Event cards with cost ${String(rule.cost)} or more; ${String(entry.cardId)} has cost ${String(resolved.cost)}.`,
          cardId: entry.cardId,
        });
      }
    }
  }

  const anyCopyCardIds = new Set(
    constructionRules.flatMap((rule) =>
      rule.type === "anyCopiesOfThisCard" ? [rule.sourceCardId] : [],
    ),
  );

  for (const entry of input.mainDeck.decoded.main) {
    const resolved = input.cards[entry.cardId];
    if (resolved === undefined) {
      continue;
    }
    if (!isSimulatorPlayableCard(resolved)) {
      errors.push({
        code: "unsupportedCard",
        message: `${String(entry.cardId)} is not playable by the simulator yet.`,
        cardId: entry.cardId,
      });
      continue;
    }
    const legality = resolved.legality[input.formatId];
    if (legality?.status === "banned") {
      errors.push({
        code: "formatIllegal",
        message: `${String(entry.cardId)} is banned in ${input.formatId}.`,
        cardId: entry.cardId,
      });
    }
    if (
      legality?.max_copies !== undefined &&
      !anyCopyCardIds.has(entry.cardId) &&
      entry.count > legality.max_copies
    ) {
      errors.push({
        code: "formatIllegal",
        message: `${String(entry.cardId)} exceeds the ${String(legality.max_copies)} copy limit in ${input.formatId}.`,
        cardId: entry.cardId,
      });
    }
  }

  if (leader !== undefined && !isSimulatorPlayableCard(leader)) {
    errors.push({
      code: "unsupportedCard",
      message: `${String(leader.cardId)} is not playable by the simulator yet.`,
      cardId: leader.cardId,
    });
  }

  if (errors.length > 0) {
    return invalidResult({
      normalizedDeckDigest: normalized.digest,
      cacheStatus: "miss",
      requestedDonDeck,
      matchDonDeck,
      constructionRules,
      errors,
    });
  }

  return {
    valid: true,
    normalizedDeckDigest: normalized.digest,
    cacheStatus: "miss",
    requestedDonDeck,
    matchDonDeck,
    constructionRules,
    errors: [],
    warnings: [],
  };
};

const invalidResult = ({
  normalizedDeckDigest,
  cacheStatus,
  requestedDonDeck,
  matchDonDeck,
  constructionRules,
  errors,
}: {
  readonly normalizedDeckDigest: string;
  readonly cacheStatus: DeckValidationResult["cacheStatus"];
  readonly requestedDonDeck: ValidatedDonDeck;
  readonly matchDonDeck: ValidatedDonDeck;
  readonly constructionRules: readonly AppliedDeckRule[];
  readonly errors: readonly DeckValidationError[];
}): DeckValidationResult => ({
  valid: false,
  normalizedDeckDigest,
  cacheStatus,
  requestedDonDeck,
  matchDonDeck,
  constructionRules,
  errors,
  warnings: [],
});

const normalizeCountedEntries = (
  entries: ReadyDeckSubmission["decoded"]["main"],
): readonly { readonly cardId: CardId; readonly count: number }[] => {
  const counts = new Map<CardId, number>();
  for (const entry of entries) {
    counts.set(entry.cardId, (counts.get(entry.cardId) ?? 0) + entry.count);
  }
  return [...counts.entries()]
    .sort(([left], [right]) => String(left).localeCompare(String(right)))
    .map(([cardId, count]) => ({ cardId, count }));
};

const expandDonDeck = (
  entries: readonly DonDeckSubmissionEntry[],
): readonly CardId[] =>
  entries.flatMap((entry) =>
    Array.from({ length: entry.count }, () => entry.cardId),
  );

const validateRequestedVariants = (
  input: DeckValidationInput,
): readonly DeckValidationError[] => {
  const errors: DeckValidationError[] = [];
  for (const entry of [
    input.mainDeck.decoded.leader,
    ...input.mainDeck.decoded.main,
    ...input.donDeck.entries,
  ]) {
    if (entry.variantIndex === undefined) {
      continue;
    }
    const resolved = input.cards[entry.cardId];
    if (resolved === undefined) {
      continue;
    }
    if (
      !resolved.variants.some(
        (variant) => variant.variantIndex === entry.variantIndex,
      )
    ) {
      errors.push({
        code: "invalidVariant",
        message: `Deck requested variant ${String(entry.variantIndex)} is not available for ${String(entry.cardId)}.`,
        cardId: entry.cardId,
      });
    }
  }
  return errors;
};

const isSimulatorPlayableCard = (card: ResolvedCard): boolean =>
  card.support.status === "implemented-dsl" ||
  card.support.status === "implemented-custom" ||
  card.support.status === "vanilla-confirmed";

const extractSubmittedDeckConstructionRules = (
  input: DeckValidationInput,
  leader: ResolvedCard | undefined,
): readonly AppliedDeckRule[] => {
  const seenCardIds = new Set<CardId>();
  const cards = [
    ...(leader === undefined ? [] : [leader]),
    ...input.mainDeck.decoded.main.flatMap((entry) => {
      const resolved = input.cards[entry.cardId];
      return resolved === undefined ? [] : [resolved];
    }),
  ];
  const rules: AppliedDeckRule[] = [];
  for (const card of cards) {
    if (seenCardIds.has(card.cardId)) {
      continue;
    }
    seenCardIds.add(card.cardId);
    rules.push(...extractDeckConstructionRules(card));
  }
  return rules;
};

const extractDeckConstructionRules = (
  card: ResolvedCard,
): readonly AppliedDeckRule[] => {
  const text = card.effectText ?? "";
  const lines = text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return lines.flatMap((line) =>
    extractDeckConstructionRulesFromLine(card, line),
  );
};

const extractDeckConstructionRulesFromLine = (
  card: ResolvedCard,
  line: string,
): readonly AppliedDeckRule[] => {
  const donDeckSize =
    /^Under the rules of this game, your DON!! deck consists of (?<count>\d+) cards\.$/u.exec(
      line,
    );
  const donDeckSizeText = donDeckSize?.groups?.["count"];
  if (donDeckSizeText !== undefined) {
    const count = Number(donDeckSizeText);
    if (Number.isSafeInteger(count) && count > 0) {
      return [{ type: "donDeckSize", sourceCardId: card.cardId, count }];
    }
  }

  const eventCost =
    /^Under the rules of this game, you cannot include Events? with a cost of (?<cost>\d+) or more in your deck and at the start of the game,/iu.exec(
      line,
    );
  const costText = eventCost?.groups?.["cost"];
  if (costText !== undefined) {
    const cost = Number(costText);
    if (Number.isSafeInteger(cost) && cost >= 0) {
      return [{ type: "excludeEventCostGte", sourceCardId: card.cardId, cost }];
    }
  }

  if (
    /^Under the rules of this game, you may have any number of this card in your deck\.$/u.test(
      line,
    )
  ) {
    return [{ type: "anyCopiesOfThisCard", sourceCardId: card.cardId }];
  }

  return [];
};

const isCachedDeckValidationResult = (
  value: unknown,
): value is CachedDeckValidationResult =>
  typeof value === "object" &&
  value !== null &&
  (value as { cacheSchemaVersion?: unknown }).cacheSchemaVersion ===
    cacheSchemaVersion &&
  isDeckValidationResult((value as { result?: unknown }).result);

const isDeckValidationResult = (
  value: unknown,
): value is DeckValidationResult =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { valid?: unknown }).valid === "boolean" &&
  typeof (value as { normalizedDeckDigest?: unknown }).normalizedDeckDigest ===
    "string";

const sha256 = (value: unknown): string =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
