import { createHash } from "node:crypto";
import { evaluateEffectBlockRuntimeSupport } from "@optcg/engine-core";
import type {
  Attribute,
  CardColor,
  CardId,
  CardSupportStatus,
  EffectBlock,
  EffectDefinition,
  MatchCardManifest,
  NormalizedErrata,
  PoneglyphCardDetail,
  PoneglyphErrata,
  ResolvedCard,
  ResolvedCardVariant,
  VariantKey,
} from "@optcg/types";

import { parseCardEffectLineDetailed } from "./card-effect-line-parser.js";

export interface DevPoneglyphFetchResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

export type DevPoneglyphFetch = (
  url: string,
) => Promise<DevPoneglyphFetchResponse>;

export interface BuildDevMatchCardManifestFromPoneglyphIdsRequest {
  readonly cardIds: readonly CardId[];
  readonly fetchCard?: DevPoneglyphFetch;
  readonly baseUrl?: string;
  readonly createdAt?: string;
  readonly devDonCount?: number;
  readonly versions?: Partial<DevManifestVersions>;
}

interface DevManifestVersions {
  readonly cardDataVersion: string;
  readonly effectDefinitionsVersion: string;
  readonly customHandlerVersion: string;
  readonly banlistVersion: string;
  readonly rulesVersion: string;
}

interface BuiltCard {
  readonly card: ResolvedCard;
  readonly definition?: EffectDefinition;
}

const defaultPoneglyphBaseUrl = "https://api.poneglyph.one";

const defaultVersions: DevManifestVersions = {
  cardDataVersion: "live-poneglyph-dev-v1",
  effectDefinitionsVersion: "generated-dev-v1",
  customHandlerVersion: "none",
  banlistVersion: "none",
  rulesVersion: "dev-rules",
};

export const parseDevCardIdList = (text: string): CardId[] => {
  const seen = new Set<string>();
  const cardIds: CardId[] = [];
  for (const token of text.split(/[\s,]+/u)) {
    const cardId = token.trim();
    if (cardId.length === 0 || seen.has(cardId)) {
      continue;
    }
    seen.add(cardId);
    cardIds.push(cardId as CardId);
  }
  return cardIds;
};

export const buildDevMatchCardManifestFromPoneglyphIds = async (
  request: BuildDevMatchCardManifestFromPoneglyphIdsRequest,
): Promise<MatchCardManifest> => {
  const versions: DevManifestVersions = {
    ...defaultVersions,
    ...request.versions,
  };
  const fetchCard = request.fetchCard ?? fetchPoneglyphCard;
  const baseUrl = request.baseUrl ?? defaultPoneglyphBaseUrl;
  const cards: Record<CardId, ResolvedCard> = {};
  const effectDefinitions: Record<string, EffectDefinition> = {};

  for (const cardId of uniqueCardIds(request.cardIds)) {
    const detail = await fetchPoneglyphCardDetail(cardId, {
      baseUrl,
      fetchCard,
    });
    const built = buildResolvedCard(detail, versions);
    cards[built.card.cardId] = built.card;
    const effectDefinitionId = built.card.support.effectDefinitionId;
    if (effectDefinitionId !== undefined && built.definition !== undefined) {
      effectDefinitions[effectDefinitionId] = built.definition;
    }
  }

  for (const card of devDonCards(request.devDonCount ?? 0, versions)) {
    cards[card.cardId] = card;
  }

  return {
    manifestHash: sha256({
      cards: Object.keys(cards).sort(),
      effectDefinitions: Object.keys(effectDefinitions).sort(),
    }),
    source: "poneglyph",
    cardDataVersion: versions.cardDataVersion,
    effectDefinitionsVersion: versions.effectDefinitionsVersion,
    customHandlerVersion: versions.customHandlerVersion,
    banlistVersion: versions.banlistVersion,
    ...(Object.keys(effectDefinitions).length === 0
      ? {}
      : { effectDefinitions }),
    cards,
    createdAt: request.createdAt ?? new Date().toISOString(),
  };
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

const fetchPoneglyphCardDetail = async (
  cardId: CardId,
  options: {
    readonly baseUrl: string;
    readonly fetchCard: DevPoneglyphFetch;
  },
): Promise<PoneglyphCardDetail> => {
  const url = `${options.baseUrl.replace(/\/+$/u, "")}/v1/cards/${encodeURIComponent(cardId)}`;
  const response = await options.fetchCard(url);
  if (!response.ok) {
    throw new Error(
      `Poneglyph card fetch failed for ${String(cardId)}: HTTP ${String(response.status)}`,
    );
  }
  const payload = await response.json();
  const detail = toPoneglyphCardDetail(payload);
  if (detail === undefined) {
    throw new Error(
      `Poneglyph card fetch failed for ${String(cardId)}: invalid response payload`,
    );
  }
  if (detail.card_number !== cardId) {
    throw new Error(
      `Poneglyph card fetch failed for ${String(cardId)}: response card_number was ${detail.card_number}`,
    );
  }
  return detail;
};

const buildResolvedCard = (
  detail: PoneglyphCardDetail,
  versions: DevManifestVersions,
): BuiltCard => {
  const cardId = detail.card_number as CardId;
  const lines = gameplayLines(detail);
  const sourceTextHash = sha256({
    effect: detail.effect,
    trigger: detail.trigger,
    card_number: detail.card_number,
  });
  const builtDefinition = buildEffectDefinition(
    cardId,
    lines,
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
    printedKeywords: [],
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

const buildEffectDefinition = (
  cardId: CardId,
  lines: readonly string[],
  sourceTextHash: string,
  versions: DevManifestVersions,
): {
  readonly definition?: EffectDefinition;
  readonly runtimeSupported: boolean;
  readonly diagnostics: readonly string[];
} => {
  const blocks: EffectBlock[] = [];
  const diagnostics: string[] = [];

  for (const [index, line] of lines.entries()) {
    const parsed = parseCardEffectLineDetailed(line);
    if (!parsed.ok) {
      diagnostics.push(
        `line ${String(index + 1)} parse failed: ${parsed.diagnostic.reason}`,
      );
      continue;
    }
    const block: EffectBlock = {
      ...parsed.value.block,
      id: `${String(cardId)}:generated:${String(index + 1)}` as EffectBlock["id"],
    };
    const runtimeSupport = evaluateEffectBlockRuntimeSupport(block);
    if (!runtimeSupport.supported) {
      diagnostics.push(
        `line ${String(index + 1)} runtime unsupported: ${
          runtimeSupport.reason ?? "unknown reason"
        }`,
      );
    }
    blocks.push(block);
  }

  if (lines.length === 0) {
    return { runtimeSupported: true, diagnostics };
  }
  const runtimeSupported =
    blocks.length === lines.length &&
    blocks.every((block) => evaluateEffectBlockRuntimeSupport(block).supported);
  if (!runtimeSupported) {
    return { runtimeSupported: false, diagnostics };
  }

  return {
    runtimeSupported: true,
    diagnostics,
    definition: {
      cardId,
      implementationStatus: "implemented-dsl",
      effects: blocks,
      metadata: {
        sourceTextHash,
        rulesVersion: versions.rulesVersion,
        effectDefinitionsVersion: versions.effectDefinitionsVersion,
        tested: true,
        generatedBy: "rule-parser",
        reviewedBy: "dev-manifest-builder",
        reviewedAt: "2026-05-25T00:00:00.000Z",
        notes: "Generated from live Poneglyph primitive parser output.",
      },
    },
  };
};

const gameplayLines = (detail: PoneglyphCardDetail): string[] =>
  [detail.effect, detail.trigger]
    .flatMap((text) => (text ?? "").split(/\r?\n/u))
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

const devDonCards = (
  count: number,
  versions: DevManifestVersions,
): ResolvedCard[] =>
  Array.from({ length: count }, (_, index) => devDonCard(index + 1, versions));

const devDonCard = (
  index: number,
  versions: DevManifestVersions,
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

const fetchPoneglyphCard: DevPoneglyphFetch = async (url) => fetch(url);

const toPoneglyphCardDetail = (
  value: unknown,
): PoneglyphCardDetail | undefined => {
  if (isPoneglyphCardDetail(value)) {
    return value;
  }
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const data = (value as Record<string, unknown>)["data"];
  return isPoneglyphCardDetail(data) ? data : undefined;
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
