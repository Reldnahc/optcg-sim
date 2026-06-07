import { createHash } from "node:crypto";
import type {
  Attribute,
  CardColor,
  CardId,
  CardSupportStatus,
  EffectDefinition,
  EffectTextDocumentKind,
  EffectTextSourceMap,
  EffectTextSpan,
  MatchCardManifest,
  NormalizedErrata,
  PoneglyphCardDetail,
  PoneglyphErrata,
  ResolvedCard,
  ResolvedCardVariant,
  VariantKey,
} from "@optcg/types";

import {
  gameplayLinesFromTextParts,
  gameplayLineSlicesFromTextParts,
} from "./effect-text-lines.js";
import { parseCardEffectLinesDetailed } from "./card-effect-line-parser.js";
import { parseRawKeywordLine } from "./keywords/index.js";
import { materializeEffectDefinition } from "./materialization/effect-definitions.js";

export interface CardDataCache {
  getJson(key: string): Promise<unknown>;
  setJson(
    key: string,
    value: unknown,
    options?: { readonly ttlSeconds: number },
  ): Promise<void>;
}

export interface PoneglyphClient {
  getCardsBatch(cardIds: readonly CardId[]): Promise<{
    readonly data: Record<string, PoneglyphCardDetail>;
    readonly missing: readonly string[];
  }>;
}

export interface PoneglyphFetchResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

export interface PoneglyphFetchRequest {
  readonly method?: "GET" | "POST";
  readonly headers?: Record<string, string>;
  readonly body?: string;
}

export type PoneglyphFetch = (
  url: string,
  init?: PoneglyphFetchRequest,
) => Promise<PoneglyphFetchResponse>;

export interface CardRepositoryVersions {
  readonly cardDataVersion: string;
  readonly effectDefinitionsVersion: string;
  readonly overlayVersion: string;
  readonly customHandlerVersion: string;
  readonly banlistVersion: string;
  readonly rulesVersion: string;
}

export interface CachedResolvedCard {
  readonly cacheSchemaVersion: 1;
  readonly versions: CardRepositoryVersions;
  readonly card: ResolvedCard;
  readonly definition?: EffectDefinition;
}

export interface CardRepository {
  resolveCards(cardIds: readonly CardId[]): Promise<ResolvedCard[]>;
  buildMatchManifest(input: {
    readonly cardIds: readonly CardId[];
    readonly createdAt?: string;
    readonly devDonCount?: number;
  }): Promise<MatchCardManifest>;
}

interface BuiltCard {
  readonly card: ResolvedCard;
  readonly definition?: EffectDefinition;
}

interface CreateCardRepositoryInput {
  readonly cache: CardDataCache;
  readonly poneglyphClient: PoneglyphClient;
  readonly versions: CardRepositoryVersions;
  readonly cacheTtlSeconds?: number;
}

const cacheSchemaVersion = 1;
const defaultCacheTtlSeconds = 60 * 60 * 24;
const maxBatchCardCount = 60;
const defaultPoneglyphBaseUrl = "https://api.poneglyph.one";

export const createCardCacheKey = (input: {
  readonly cardId: CardId;
  readonly versions: CardRepositoryVersions;
}): string =>
  [
    "card",
    input.versions.cardDataVersion,
    input.versions.effectDefinitionsVersion,
    input.versions.overlayVersion,
    input.cardId,
  ].join(":");

export const createCardRepository = (
  input: CreateCardRepositoryInput,
): CardRepository => {
  const resolveBuiltCards = async (
    cardIds: readonly CardId[],
  ): Promise<BuiltCard[]> => {
    const uniqueIds = uniqueCardIds(cardIds);
    const byId = new Map<CardId, BuiltCard>();
    const missingIds: CardId[] = [];

    for (const cardId of uniqueIds) {
      const cached = await input.cache.getJson(
        createCardCacheKey({ cardId, versions: input.versions }),
      );
      if (isCurrentCachedResolvedCard(cached, input.versions, cardId)) {
        byId.set(cardId, {
          card: cached.card,
          ...(cached.definition === undefined
            ? {}
            : { definition: cached.definition }),
        });
        continue;
      }
      missingIds.push(cardId);
    }

    for (const chunk of chunks(missingIds, maxBatchCardCount)) {
      const batch = await input.poneglyphClient.getCardsBatch(chunk);
      if (batch.missing.length > 0) {
        throw new Error(
          `Poneglyph card batch fetch failed: missing ${batch.missing.join(", ")}`,
        );
      }
      for (const cardId of chunk) {
        const detail = batch.data[cardId];
        if (detail === undefined) {
          throw new Error(
            `Poneglyph card batch fetch failed: missing ${String(cardId)}`,
          );
        }
        if (detail.card_number !== cardId) {
          throw new Error(
            `Poneglyph card batch fetch failed for ${String(cardId)}: response card_number was ${detail.card_number}`,
          );
        }
        const built = buildResolvedCard(detail, input.versions);
        byId.set(cardId, built);
        await input.cache.setJson(
          createCardCacheKey({ cardId, versions: input.versions }),
          {
            cacheSchemaVersion,
            versions: input.versions,
            card: built.card,
            ...(built.definition === undefined
              ? {}
              : { definition: built.definition }),
          },
          { ttlSeconds: input.cacheTtlSeconds ?? defaultCacheTtlSeconds },
        );
      }
    }

    return cardIds.map((cardId) => {
      const built = byId.get(cardId);
      if (built === undefined) {
        throw new Error(`Card repository failed to resolve ${String(cardId)}.`);
      }
      return built;
    });
  };

  return {
    async resolveCards(cardIds) {
      return (await resolveBuiltCards(cardIds)).map((built) => built.card);
    },
    async buildMatchManifest(manifestInput) {
      const cards: Record<CardId, ResolvedCard> = {};
      const effectDefinitions: Record<string, EffectDefinition> = {};
      for (const built of await resolveBuiltCards(
        uniqueCardIds(manifestInput.cardIds),
      )) {
        cards[built.card.cardId] = built.card;
        const definitionId = built.card.support.effectDefinitionId;
        if (definitionId !== undefined && built.definition !== undefined) {
          effectDefinitions[definitionId] = built.definition;
        }
      }

      for (const card of devDonCards(
        manifestInput.devDonCount ?? 0,
        input.versions,
      )) {
        cards[card.cardId] = card;
      }

      return {
        manifestHash: sha256({
          cards: Object.keys(cards).sort(),
          effectDefinitions: Object.keys(effectDefinitions).sort(),
        }),
        source: "poneglyph",
        cardDataVersion: input.versions.cardDataVersion,
        effectDefinitionsVersion: input.versions.effectDefinitionsVersion,
        customHandlerVersion: input.versions.customHandlerVersion,
        banlistVersion: input.versions.banlistVersion,
        ...(Object.keys(effectDefinitions).length === 0
          ? {}
          : { effectDefinitions }),
        cards,
        createdAt: manifestInput.createdAt ?? new Date().toISOString(),
      };
    },
  };
};

export const createPoneglyphHttpClient = (input?: {
  readonly baseUrl?: string;
  readonly fetchCard?: PoneglyphFetch;
}): PoneglyphClient => {
  const baseUrl = input?.baseUrl ?? defaultPoneglyphBaseUrl;
  const fetchCard = input?.fetchCard ?? fetchPoneglyphCard;
  return {
    async getCardsBatch(cardIds) {
      const data: Record<string, PoneglyphCardDetail> = {};
      const missing: string[] = [];
      for (const chunk of chunks(cardIds, maxBatchCardCount)) {
        const batch = await fetchPoneglyphCardDetailBatch(chunk, {
          baseUrl,
          fetchCard,
        });
        Object.assign(data, batch.data);
        missing.push(...batch.missing);
      }
      return { data, missing };
    },
  };
};

const isCurrentCachedResolvedCard = (
  value: unknown,
  versions: CardRepositoryVersions,
  cardId: CardId,
): value is CachedResolvedCard =>
  isCachedResolvedCard(value) &&
  value.card.cardId === cardId &&
  value.versions.cardDataVersion === versions.cardDataVersion &&
  value.versions.effectDefinitionsVersion ===
    versions.effectDefinitionsVersion &&
  value.versions.overlayVersion === versions.overlayVersion;

const isCachedResolvedCard = (value: unknown): value is CachedResolvedCard => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<CachedResolvedCard>;
  return (
    candidate.cacheSchemaVersion === cacheSchemaVersion &&
    typeof candidate.versions === "object" &&
    typeof candidate.card === "object"
  );
};

const uniqueCardIds = (cardIds: readonly CardId[]): CardId[] => {
  const seen = new Set<CardId>();
  const unique: CardId[] = [];
  for (const cardId of cardIds) {
    if (seen.has(cardId)) {
      continue;
    }
    seen.add(cardId);
    unique.push(cardId);
  }
  return unique;
};

const chunks = <T>(values: readonly T[], size: number): T[][] => {
  const chunked: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunked.push(values.slice(index, index + size));
  }
  return chunked;
};

const fetchPoneglyphCardDetailBatch = async (
  cardIds: readonly CardId[],
  options: {
    readonly baseUrl: string;
    readonly fetchCard: PoneglyphFetch;
  },
): Promise<{
  readonly data: Record<string, PoneglyphCardDetail>;
  readonly missing: readonly string[];
}> => {
  if (cardIds.length === 0) {
    return { data: {}, missing: [] };
  }
  const url = `${options.baseUrl.replace(/\/+$/u, "")}/v1/cards/batch`;
  const response = await options.fetchCard(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ card_numbers: cardIds }),
  });
  if (!response.ok) {
    throw new Error(
      `Poneglyph card batch fetch failed: HTTP ${String(response.status)}`,
    );
  }
  const payload = await response.json();
  const batch = toPoneglyphCardBatchPayload(payload);
  if (batch === undefined) {
    throw new Error(
      "Poneglyph card batch fetch failed: invalid response payload",
    );
  }
  return batch;
};

const buildResolvedCard = (
  detail: PoneglyphCardDetail,
  versions: CardRepositoryVersions,
): BuiltCard => {
  const cardId = detail.card_number as CardId;
  const lines = gameplayLines(detail);
  const printedKeywords = rawKeywordsFromLines(lines);
  const effectLines = lines.filter(
    (line) => parseRawKeywordLine({ text: line }) === undefined,
  );
  const sourceTextHash = sha256({
    effect: detail.effect,
    trigger: detail.trigger,
    card_number: detail.card_number,
  });
  const builtDefinition = materializeEffectDefinition(
    cardId,
    effectLines,
    sourceTextHash,
    versions,
  );
  const behaviorHash = sha256({
    effect: detail.effect,
    trigger: detail.trigger,
    officialFaq: detail.official_faq,
    errata: detail.variants.flatMap((variant) => variant.errata),
    definition: builtDefinition.definition?.effects ?? [],
  });
  const effectTextSourceMap = effectTextSourceMapFromText(
    detail.effect,
    "effect",
  );
  const triggerTextSourceMap = effectTextSourceMapFromText(
    detail.trigger,
    "trigger",
  );
  const supportStatus: CardSupportStatus =
    lines.length === 0
      ? "vanilla-confirmed"
      : builtDefinition.runtimeSupported
        ? "implemented-dsl"
        : "unsupported";
  const definitionId = `${detail.card_number}.generated-dev-support`;
  const normalized = normalizeVariants(detail);
  const supportNotes =
    builtDefinition.diagnostics.length === 0
      ? undefined
      : builtDefinition.diagnostics.join("; ");
  const card: ResolvedCard = {
    cardId,
    language: detail.language,
    name: detail.name,
    category: normalizeCategory(detail.card_type),
    set: detail.set,
    setName: detail.set_name,
    released: detail.released,
    colors: detail.color.map(normalizeColor),
    attributes: (detail.attribute ?? []).map(normalizeAttribute),
    types: detail.types,
    printedKeywords,
    variants: normalized.variants,
    legality: detail.legality,
    officialFaq: detail.official_faq,
    errata: normalized.errata,
    sourceTextHash,
    behaviorHash,
    support: {
      cardId,
      status: supportStatus,
      ...(builtDefinition.definition === undefined
        ? {}
        : { effectDefinitionId: definitionId }),
      tested: supportStatus !== "unsupported",
      rulesVersion: versions.rulesVersion,
      cardDataVersion: versions.cardDataVersion,
      sourceTextHash,
      behaviorHash,
      ...optional("notes", supportNotes),
    },
    ...optional("block", detail.block),
    ...optional("releasedAt", detail.released_at),
    ...optional("rarity", detail.rarity),
    ...optional("cost", detail.cost),
    ...optional("power", detail.power),
    ...optional("counter", detail.counter),
    ...optional("life", detail.life),
    ...optional("effectText", detail.effect),
    ...optional("triggerText", detail.trigger),
    ...(effectTextSourceMap === undefined ? {} : { effectTextSourceMap }),
    ...(triggerTextSourceMap === undefined ? {} : { triggerTextSourceMap }),
  };

  if (builtDefinition.definition === undefined) {
    return { card };
  }
  return {
    card,
    definition: {
      ...builtDefinition.definition,
      implementationStatus: supportStatus,
    },
  };
};

const gameplayLines = (detail: PoneglyphCardDetail): string[] =>
  gameplayLinesFromTextParts([detail.effect, detail.trigger]);

const effectTextSourceMapFromText = (
  text: string | null | undefined,
  textKind: EffectTextDocumentKind,
): EffectTextSourceMap | undefined => {
  if (text === null || text === undefined || text.length === 0) {
    return undefined;
  }

  const spans: EffectTextSpan[] = [];
  for (const slice of gameplayLineSlicesFromTextParts([text])) {
    const parsed = parseCardEffectLinesDetailed(slice.text);
    if (!parsed.ok) {
      continue;
    }
    for (const value of parsed.value) {
      if (!("sourceMap" in value)) {
        continue;
      }
      spans.push(
        ...value.sourceMap.spans.map((span) => offsetSpan(span, slice.start)),
      );
    }
  }

  return spans.length === 0
    ? undefined
    : {
        textKind,
        sourceText: text,
        spans,
      };
};

const offsetSpan = (span: EffectTextSpan, offset: number): EffectTextSpan => ({
  ...span,
  start: span.start + offset,
  end: span.end + offset,
});

const rawKeywordsFromLines = (
  lines: readonly string[],
): ResolvedCard["printedKeywords"] => {
  const keywords: ResolvedCard["printedKeywords"] = [];
  for (const line of lines) {
    const keyword = parseRawKeywordLine({ text: line });
    if (
      keyword !== undefined &&
      !keywords.some((candidate) => candidate === keyword.keyword)
    ) {
      keywords.push(keyword.keyword);
    }
  }
  return keywords;
};

const devDonCards = (
  count: number,
  versions: CardRepositoryVersions,
): ResolvedCard[] =>
  Array.from({ length: count }, (_, index) => devDonCard(index + 1, versions));

const devDonCard = (
  index: number,
  versions: CardRepositoryVersions,
): ResolvedCard => {
  const cardId = `dev-don-${String(index)}` as CardId;
  const sourceTextHash = sha256({ cardId, type: "don" });
  const behaviorHash = sha256({ cardId, type: "don", behavior: "don-card" });
  return {
    cardId,
    language: "en",
    name: "DON!!",
    category: "don",
    set: "DEV",
    setName: "Dev DON",
    released: true,
    colors: [],
    attributes: [],
    types: [],
    printedKeywords: [],
    variants: [],
    legality: {},
    officialFaq: [],
    errata: [],
    sourceTextHash,
    behaviorHash,
    support: {
      cardId,
      status: "vanilla-confirmed",
      tested: true,
      rulesVersion: versions.rulesVersion,
      cardDataVersion: versions.cardDataVersion,
      sourceTextHash,
      behaviorHash,
    },
  };
};

const normalizeCategory = (value: string): ResolvedCard["category"] => {
  switch (value) {
    case "Leader":
      return "leader";
    case "Character":
      return "character";
    case "Stage":
      return "stage";
    case "Event":
      return "event";
    case "DON!!":
      return "don";
    default:
      throw new Error(`Unsupported Poneglyph card type ${value}.`);
  }
};

const normalizeColor = (value: string): CardColor => {
  switch (value) {
    case "Red":
      return "red";
    case "Green":
      return "green";
    case "Blue":
      return "blue";
    case "Purple":
      return "purple";
    case "Black":
      return "black";
    case "Yellow":
      return "yellow";
    default:
      throw new Error(`Unsupported Poneglyph color ${value}.`);
  }
};

const normalizeAttribute = (value: string): Attribute => {
  switch (value) {
    case "Slash":
      return "slash";
    case "Strike":
      return "strike";
    case "Ranged":
      return "ranged";
    case "Special":
      return "special";
    case "Wisdom":
      return "wisdom";
    case "?":
      return "?";
    default:
      throw new Error(`Unsupported Poneglyph attribute ${value}.`);
  }
};

const normalizeVariants = (
  card: PoneglyphCardDetail,
): {
  readonly variants: ResolvedCardVariant[];
  readonly errata: NormalizedErrata[];
} => {
  const variants: ResolvedCardVariant[] = [];
  const errata: NormalizedErrata[] = [];
  for (const variant of card.variants) {
    variants.push({
      variantKey: variantKey(card, variant.index),
      variantIndex: variant.index,
      ...optional("label", variant.label),
      ...optional("artist", variant.artist),
      ...optional("productId", variant.product.id),
      ...optional("productSlug", variant.product.slug),
      ...optional("productName", variant.product.name),
      ...optional("productSetCode", variant.product.set_code),
      ...optional("stockImageFull", variant.images.stock.full),
      ...optional("stockImageThumb", variant.images.stock.thumb),
      ...optional("scanImageDisplay", variant.images.scan.display),
      ...optional("scanImageFull", variant.images.scan.full),
      ...optional("scanImageThumb", variant.images.scan.thumb),
    });
    errata.push(...normalizeErrata(variant.errata, card, variant.index));
  }
  return { variants, errata };
};

const normalizeErrata = (
  errata: readonly PoneglyphErrata[],
  card: PoneglyphCardDetail,
  variantIndex: number,
): NormalizedErrata[] =>
  errata.map((entry) => ({
    ...entry,
    variantIndex,
    variantKey: variantKey(card, variantIndex),
  }));

const variantKey = (
  card: PoneglyphCardDetail,
  variantIndex: number,
): VariantKey => `${card.card_number}:v${String(variantIndex)}` as VariantKey;

const optional = <T>(
  key: string,
  value: T | null | undefined,
): Record<string, T> =>
  value === undefined || value === null ? {} : { [key]: value };

const sha256 = (value: unknown): string =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

const fetchPoneglyphCard: PoneglyphFetch = async (url, init) =>
  fetch(url, init);

const toPoneglyphCardBatchPayload = (
  value: unknown,
):
  | {
      readonly data: Record<string, PoneglyphCardDetail>;
      readonly missing: readonly string[];
    }
  | undefined => {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const candidate = value as Record<string, unknown>;
  const data = candidate["data"];
  const missing = candidate["missing"];
  if (
    typeof data !== "object" ||
    data === null ||
    !Array.isArray(missing) ||
    !missing.every((entry) => typeof entry === "string")
  ) {
    return undefined;
  }
  const details: Record<string, PoneglyphCardDetail> = {};
  for (const [cardId, detail] of Object.entries(data)) {
    if (!isPoneglyphCardDetail(detail)) {
      return undefined;
    }
    details[cardId] = detail;
  }
  return { data: details, missing };
};

const isPoneglyphCardDetail = (
  value: unknown,
): value is PoneglyphCardDetail => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate["card_number"] === "string" &&
    typeof candidate["name"] === "string" &&
    typeof candidate["language"] === "string" &&
    typeof candidate["set"] === "string" &&
    typeof candidate["set_name"] === "string" &&
    typeof candidate["card_type"] === "string" &&
    Array.isArray(candidate["color"]) &&
    candidate["color"].every((color) => typeof color === "string") &&
    (candidate["attribute"] === null ||
      (Array.isArray(candidate["attribute"]) &&
        candidate["attribute"].every(
          (attribute) => typeof attribute === "string",
        ))) &&
    Array.isArray(candidate["types"]) &&
    candidate["types"].every((type) => typeof type === "string") &&
    (candidate["effect"] === null || typeof candidate["effect"] === "string") &&
    (candidate["trigger"] === null ||
      typeof candidate["trigger"] === "string") &&
    Array.isArray(candidate["variants"]) &&
    typeof candidate["legality"] === "object" &&
    candidate["legality"] !== null &&
    Array.isArray(candidate["official_faq"])
  );
};
