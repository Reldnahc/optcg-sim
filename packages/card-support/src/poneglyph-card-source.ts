import { gameplayLinesFromTextParts, parseRawKeywordLine } from "@optcg/cards";
import type { CardId } from "@optcg/types";
import {
  createApiDeckHashDictionarySource,
  createDeckHashCodec,
  type DeckHashDeck,
} from "optcg-deck-hash";

export interface BehaviorCoverageSourceEntry {
  readonly label: string;
  readonly text: string;
  readonly cardId?: string;
  readonly lineNumber?: number;
  readonly focusLineNumber?: number;
}

export interface PoneglyphCardProbePayload {
  readonly cardId: string;
  readonly effect: string | null;
  readonly trigger: string | null;
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
  url: string | URL,
  init?: PoneglyphFetchRequest,
) => Promise<PoneglyphFetchResponse>;

export interface DeckHashCodecPort {
  readonly decode: (hash: string) => Promise<DeckHashDeck>;
}

export interface DeckHashProbeEntry {
  readonly cardId: string;
  readonly count: number;
  readonly variantIndex?: number;
}

export interface AggregatedDeckHashProbeEntry {
  readonly cardId: string;
  readonly count: number;
  readonly variantIndexes: readonly number[];
}

export const defaultPoneglyphBaseUrl = "https://api.poneglyph.one";

export const createPoneglyphDeckHashCodec = (): DeckHashCodecPort => {
  const codec = createDeckHashCodec({
    dictionarySource: createApiDeckHashDictionarySource({
      baseUrl: "https://poneglyph.one",
    }),
  });
  return {
    decode: (hash) => codec.decode(hash),
  };
};

export const createPoneglyphCoverageEntriesFromCardIds = async (
  cardIds: readonly string[],
  options: {
    readonly baseUrl: string;
    readonly fetchPoneglyph: PoneglyphFetch;
  },
): Promise<
  | {
      readonly ok: true;
      readonly entries: readonly BehaviorCoverageSourceEntry[];
    }
  | { readonly ok: false; readonly error: string }
> => {
  const fetchedCards = await fetchPoneglyphCardPayloads(cardIds, options);
  const entries: BehaviorCoverageSourceEntry[] = [];
  for (const cardId of uniqueStrings(cardIds)) {
    const fetched = fetchedCards.get(cardId);
    if (fetched === undefined || !fetched.ok) {
      return {
        ok: false,
        error:
          fetched?.error ??
          `Poneglyph card fetch failed for ${cardId}: missing batch result`,
      };
    }
    entries.push(...coverageEntriesForCard(fetched.card));
  }
  return { ok: true, entries };
};

export const createPoneglyphCoverageEntriesFromSet = async (
  setCode: string,
  options: {
    readonly baseUrl: string;
    readonly fetchPoneglyph: PoneglyphFetch;
  },
): Promise<
  | {
      readonly ok: true;
      readonly entries: readonly BehaviorCoverageSourceEntry[];
    }
  | { readonly ok: false; readonly error: string }
> => {
  const normalizedSetCode = setCode.trim().toUpperCase();
  const fetchedSet = await fetchPoneglyphSetCardIds(normalizedSetCode, options);
  if (!fetchedSet.ok) {
    return fetchedSet;
  }
  return createPoneglyphCoverageEntriesFromCardIds(fetchedSet.cardIds, options);
};

export const createPoneglyphCoverageEntriesFromDeckHash = async (
  deckHash: string,
  options: {
    readonly baseUrl: string;
    readonly deckHashCodec: DeckHashCodecPort;
    readonly fetchPoneglyph: PoneglyphFetch;
  },
): Promise<
  | {
      readonly ok: true;
      readonly entries: readonly BehaviorCoverageSourceEntry[];
    }
  | { readonly ok: false; readonly error: string }
> => {
  const decoded = await decodeProbeDeckHash(deckHash, options.deckHashCodec);
  if (!decoded.ok) {
    return {
      ok: false,
      error: `Deck hash decode failed: ${decoded.error}`,
    };
  }
  const aggregated = aggregateDeckHashEntries(decoded.entries);
  return createPoneglyphCoverageEntriesFromCardIds(
    aggregated.map((entry) => entry.cardId),
    options,
  );
};

export const decodeProbeDeckHash = async (
  deckHash: string,
  codec: DeckHashCodecPort,
): Promise<
  | { readonly ok: true; readonly entries: readonly DeckHashProbeEntry[] }
  | { readonly ok: false; readonly error: string }
> => {
  try {
    const decoded = await codec.decode(deckHash);
    return {
      ok: true,
      entries: deckHashEntriesFromDecodedDeck(decoded),
    };
  } catch (error: unknown) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

export const aggregateDeckHashEntries = (
  entries: readonly DeckHashProbeEntry[],
): readonly AggregatedDeckHashProbeEntry[] => {
  const byCardId = new Map<string, AggregatedDeckHashProbeEntry>();
  for (const entry of entries) {
    const existing = byCardId.get(entry.cardId);
    const variantIndexes =
      entry.variantIndex === undefined ? [] : [entry.variantIndex];
    if (existing === undefined) {
      byCardId.set(entry.cardId, {
        cardId: entry.cardId,
        count: entry.count,
        variantIndexes,
      });
      continue;
    }
    byCardId.set(entry.cardId, {
      cardId: existing.cardId,
      count: existing.count + entry.count,
      variantIndexes: uniqueNumbers([
        ...existing.variantIndexes,
        ...variantIndexes,
      ]),
    });
  }
  return [...byCardId.values()];
};

export const fetchPoneglyphCardPayload = async (
  cardId: string,
  options: {
    readonly baseUrl: string;
    readonly fetchPoneglyph: PoneglyphFetch;
  },
): Promise<
  | { readonly ok: true; readonly card: PoneglyphCardProbePayload }
  | { readonly ok: false; readonly error: string }
> => {
  const url = `${options.baseUrl.replace(/\/+$/u, "")}/v1/cards/${encodeURIComponent(cardId)}`;
  const response = await safeFetchPoneglyph(
    options.fetchPoneglyph,
    url,
    undefined,
    `Poneglyph card fetch failed for ${cardId}`,
  );
  if (!response.ok) {
    return response;
  }
  if (!response.response.ok) {
    return {
      ok: false,
      error: `Poneglyph card fetch failed for ${cardId}: HTTP ${String(response.response.status)}`,
    };
  }

  const payload = await safeJson(
    response.response,
    `Poneglyph card fetch failed for ${cardId}`,
  );
  if (!payload.ok) {
    return payload;
  }
  const cardPayload = toPoneglyphCardProbePayload(payload.value);
  if (cardPayload === undefined) {
    return {
      ok: false,
      error: `Poneglyph card fetch failed for ${cardId}: invalid response payload`,
    };
  }

  return {
    ok: true,
    card: {
      cardId: cardPayload.card_number,
      effect: cardPayload.effect,
      trigger: cardPayload.trigger,
    },
  };
};

export const fetchPoneglyphCardPayloads = async (
  cardIds: readonly string[],
  options: {
    readonly baseUrl: string;
    readonly fetchPoneglyph: PoneglyphFetch;
  },
): Promise<
  Map<
    string,
    | { readonly ok: true; readonly card: PoneglyphCardProbePayload }
    | { readonly ok: false; readonly error: string }
  >
> => {
  const results = new Map<
    string,
    | { readonly ok: true; readonly card: PoneglyphCardProbePayload }
    | { readonly ok: false; readonly error: string }
  >();
  for (const chunk of chunks(uniqueStrings(cardIds), maxBatchCardCount)) {
    const fetched = await fetchPoneglyphCardPayloadBatch(chunk, options);
    if (!fetched.ok) {
      for (const cardId of chunk) {
        results.set(cardId, { ok: false, error: fetched.error });
      }
      continue;
    }
    for (const cardId of chunk) {
      const card = fetched.cards.get(cardId);
      if (card === undefined) {
        results.set(cardId, {
          ok: false,
          error: `Poneglyph card batch fetch failed for ${cardId}: missing card`,
        });
        continue;
      }
      if (card.cardId !== cardId) {
        results.set(cardId, {
          ok: false,
          error: `Poneglyph card batch fetch failed for ${cardId}: response card_number was ${card.cardId}`,
        });
        continue;
      }
      results.set(cardId, { ok: true, card });
    }
  }
  return results;
};

export const fetchPoneglyphSetCardIds = async (
  setCode: string,
  options: {
    readonly baseUrl: string;
    readonly fetchPoneglyph: PoneglyphFetch;
  },
): Promise<
  | { readonly ok: true; readonly cardIds: readonly CardId[] }
  | { readonly ok: false; readonly error: string }
> => {
  const prefix = `${setCode}-`;
  const cardIds: CardId[] = [];
  let page = 1;
  let hasMore = true;
  while (hasMore) {
    const url = new URL(`${options.baseUrl.replace(/\/+$/u, "")}/v1/search`);
    url.searchParams.set("page", String(page));
    url.searchParams.set("limit", "500");
    url.searchParams.set("sort", "card_number");
    url.searchParams.set("order", "asc");
    url.searchParams.set("collapse", "card");
    const response = await safeFetchPoneglyph(
      options.fetchPoneglyph,
      url,
      undefined,
      `Poneglyph set catalog fetch failed for ${setCode}`,
    );
    if (!response.ok) {
      return response;
    }
    if (!response.response.ok) {
      return {
        ok: false,
        error: `Poneglyph set catalog fetch failed for ${setCode}: HTTP ${String(response.response.status)}`,
      };
    }
    const payload = await safeJson(
      response.response,
      `Poneglyph set catalog fetch failed for ${setCode}`,
    );
    if (!payload.ok) {
      return payload;
    }
    const catalog = toPoneglyphCardCatalogPayload(payload.value);
    if (catalog === undefined) {
      return {
        ok: false,
        error: `Poneglyph set catalog fetch failed for ${setCode}: invalid response payload`,
      };
    }
    for (const cardId of catalog.cardIds) {
      if (cardId.toUpperCase().startsWith(prefix)) {
        cardIds.push(cardId);
      }
    }
    hasMore = catalog.hasMore;
    page += 1;
  }

  return { ok: true, cardIds: [...new Set(cardIds)] };
};

export const fetchPoneglyphSetCodes = async (options: {
  readonly baseUrl: string;
  readonly fetchPoneglyph: PoneglyphFetch;
}): Promise<
  | { readonly ok: true; readonly setCodes: readonly string[] }
  | { readonly ok: false; readonly error: string }
> => {
  const setCodes = new Set<string>();
  let page = 1;
  let hasMore = true;
  while (hasMore) {
    const response = await fetchPoneglyphCardCatalogPage(page, options, {
      errorPrefix: "Poneglyph set catalog fetch failed",
    });
    if (!response.ok) {
      return response;
    }
    for (const cardId of response.catalog.cardIds) {
      const setCode = setCodeFromCardId(cardId);
      if (setCode !== undefined) {
        setCodes.add(setCode);
      }
    }
    hasMore = response.catalog.hasMore;
    page += 1;
  }

  return { ok: true, setCodes: [...setCodes].sort(compareSetCodes) };
};

export const fetchPoneglyphCard: PoneglyphFetch = async (url, init) =>
  fetch(url, init);

const maxBatchCardCount = 60;

const coverageEntriesForCard = (
  card: PoneglyphCardProbePayload,
): readonly BehaviorCoverageSourceEntry[] => {
  const runtimeLines = gameplayLinesFromTextParts([
    card.effect,
    card.trigger,
  ]).flatMap((text, index) =>
    isBehaviorCoverageRuntimeLine(text)
      ? [{ text, sourceLineNumber: index + 1 }]
      : [],
  );
  const fullRuntimeText = runtimeLines.map((line) => line.text).join("\n");
  return runtimeLines.map((line, index) => ({
    label: `${card.cardId} line ${String(line.sourceLineNumber)}`,
    cardId: card.cardId,
    lineNumber: line.sourceLineNumber,
    focusLineNumber: index + 1,
    text: fullRuntimeText,
  }));
};

const isBehaviorCoverageRuntimeLine = (text: string): boolean =>
  parseRawKeywordLine({ text }) === undefined && !isRulesMetadataLine(text);

const isRulesMetadataLine = (text: string): boolean => {
  const trimmed = text.trim();
  return (
    /^Under the rules of this game,/iu.test(trimmed) ||
    /according to the rules\.?$/iu.test(trimmed)
  );
};

const deckHashEntriesFromDecodedDeck = (
  decoded: DeckHashDeck,
): readonly DeckHashProbeEntry[] => [
  ...(decoded.leader === null
    ? []
    : [
        {
          cardId: decoded.leader.card_number,
          count: decoded.leader.count,
          ...(decoded.leader.variant_index === undefined
            ? {}
            : { variantIndex: decoded.leader.variant_index }),
        },
      ]),
  ...decoded.main.map((entry) => ({
    cardId: entry.card_number,
    count: entry.count,
    ...(entry.variant_index === undefined
      ? {}
      : { variantIndex: entry.variant_index }),
  })),
];

const fetchPoneglyphCardPayloadBatch = async (
  cardIds: readonly string[],
  options: {
    readonly baseUrl: string;
    readonly fetchPoneglyph: PoneglyphFetch;
  },
): Promise<
  | {
      readonly ok: true;
      readonly cards: ReadonlyMap<string, PoneglyphCardProbePayload>;
    }
  | { readonly ok: false; readonly error: string }
> => {
  if (cardIds.length === 0) {
    return { ok: true, cards: new Map() };
  }
  const url = `${options.baseUrl.replace(/\/+$/u, "")}/v1/cards/batch`;
  const response = await safeFetchPoneglyph(
    options.fetchPoneglyph,
    url,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ card_numbers: cardIds }),
    },
    "Poneglyph card batch fetch failed",
  );
  if (!response.ok) {
    return response;
  }
  if (!response.response.ok) {
    return {
      ok: false,
      error: `Poneglyph card batch fetch failed: HTTP ${String(response.response.status)}`,
    };
  }

  const payload = await safeJson(
    response.response,
    "Poneglyph card batch fetch failed",
  );
  if (!payload.ok) {
    return payload;
  }
  const batch = toPoneglyphCardProbeBatchPayload(payload.value);
  if (batch === undefined) {
    return {
      ok: false,
      error: "Poneglyph card batch fetch failed: invalid response payload",
    };
  }
  if (batch.missing.length > 0) {
    return {
      ok: false,
      error: `Poneglyph card batch fetch failed: missing ${batch.missing.join(", ")}`,
    };
  }

  return {
    ok: true,
    cards: new Map(
      Object.values(batch.data).map((card) => [
        card.card_number,
        {
          cardId: card.card_number,
          effect: card.effect,
          trigger: card.trigger,
        },
      ]),
    ),
  };
};

const safeFetchPoneglyph = async (
  fetchPoneglyph: PoneglyphFetch,
  url: string | URL,
  init: PoneglyphFetchRequest | undefined,
  errorPrefix: string,
): Promise<
  | { readonly ok: true; readonly response: PoneglyphFetchResponse }
  | { readonly ok: false; readonly error: string }
> => {
  try {
    return { ok: true, response: await fetchPoneglyph(url, init) };
  } catch (error: unknown) {
    return {
      ok: false,
      error: `${errorPrefix}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

const safeJson = async (
  response: PoneglyphFetchResponse,
  errorPrefix: string,
): Promise<
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly error: string }
> => {
  try {
    return { ok: true, value: await response.json() };
  } catch (error: unknown) {
    return {
      ok: false,
      error: `${errorPrefix}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

const uniqueNumbers = (values: readonly number[]): readonly number[] => [
  ...new Set(values),
];

const uniqueStrings = (values: readonly string[]): string[] => [
  ...new Set(values),
];

const chunks = <T>(values: readonly T[], size: number): T[][] => {
  const chunked: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunked.push(values.slice(index, index + size));
  }
  return chunked;
};

const fetchPoneglyphCardCatalogPage = async (
  page: number,
  options: {
    readonly baseUrl: string;
    readonly fetchPoneglyph: PoneglyphFetch;
  },
  labels: { readonly errorPrefix: string },
): Promise<
  | {
      readonly ok: true;
      readonly catalog: {
        readonly cardIds: readonly CardId[];
        readonly hasMore: boolean;
      };
    }
  | { readonly ok: false; readonly error: string }
> => {
  const url = new URL(`${options.baseUrl.replace(/\/+$/u, "")}/v1/search`);
  url.searchParams.set("page", String(page));
  url.searchParams.set("limit", "500");
  url.searchParams.set("sort", "card_number");
  url.searchParams.set("order", "asc");
  url.searchParams.set("collapse", "card");
  const response = await safeFetchPoneglyph(
    options.fetchPoneglyph,
    url,
    undefined,
    labels.errorPrefix,
  );
  if (!response.ok) {
    return response;
  }
  if (!response.response.ok) {
    return {
      ok: false,
      error: `${labels.errorPrefix}: HTTP ${String(response.response.status)}`,
    };
  }
  const payload = await safeJson(response.response, labels.errorPrefix);
  if (!payload.ok) {
    return payload;
  }
  const catalog = toPoneglyphCardCatalogPayload(payload.value);
  if (catalog === undefined) {
    return {
      ok: false,
      error: `${labels.errorPrefix}: invalid response payload`,
    };
  }
  return { ok: true, catalog };
};

const setCodeFromCardId = (cardId: string): string | undefined => {
  const prefix = cardId.trim().toUpperCase().split("-")[0];
  if (prefix === undefined || !/^[A-Z]+[0-9]*$/u.test(prefix)) {
    return undefined;
  }
  return prefix;
};

const compareSetCodes = (left: string, right: string): number => {
  const leftParts = setCodeSortParts(left);
  const rightParts = setCodeSortParts(right);
  const familyDelta = leftParts.familyRank - rightParts.familyRank;
  if (familyDelta !== 0) {
    return familyDelta;
  }
  const prefixDelta = leftParts.prefix.localeCompare(rightParts.prefix);
  if (prefixDelta !== 0) {
    return prefixDelta;
  }
  return leftParts.number - rightParts.number || left.localeCompare(right);
};

const setCodeSortParts = (
  setCode: string,
): {
  readonly familyRank: number;
  readonly prefix: string;
  readonly number: number;
} => {
  const match = /^([A-Z]+)(\d*)$/u.exec(setCode);
  const prefix = match?.[1] ?? setCode;
  const numberText = match?.[2] ?? "";
  const familyIndex = setFamilyOrder.indexOf(prefix);
  return {
    familyRank: familyIndex < 0 ? setFamilyOrder.length : familyIndex,
    prefix,
    number: numberText.length === 0 ? 0 : Number.parseInt(numberText, 10),
  };
};

const setFamilyOrder = ["OP", "PRB", "EB", "ST", "P"];

const toPoneglyphCardCatalogPayload = (
  value: unknown,
):
  | { readonly cardIds: readonly CardId[]; readonly hasMore: boolean }
  | undefined => {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const candidate = value as Record<string, unknown>;
  const data = candidate["data"];
  if (!Array.isArray(data)) {
    return undefined;
  }
  const cardIds: CardId[] = [];
  for (const card of data) {
    if (typeof card !== "object" || card === null) {
      return undefined;
    }
    const cardNumber = (card as Record<string, unknown>)["card_number"];
    if (typeof cardNumber !== "string") {
      return undefined;
    }
    cardIds.push(cardNumber as CardId);
  }
  const pagination = candidate["pagination"];
  const hasMore =
    typeof pagination === "object" &&
    pagination !== null &&
    (pagination as Record<string, unknown>)["has_more"] === true;
  return { cardIds, hasMore };
};

const isPoneglyphCardProbePayload = (
  value: unknown,
): value is {
  readonly card_number: CardId;
  readonly effect: string | null;
  readonly trigger?: string | null;
} => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  const effect = candidate["effect"];
  const trigger = candidate["trigger"];
  return (
    typeof candidate["card_number"] === "string" &&
    (typeof effect === "string" || effect === null) &&
    (typeof trigger === "string" || trigger === null || trigger === undefined)
  );
};

const toPoneglyphCardProbePayload = (
  value: unknown,
):
  | {
      readonly card_number: CardId;
      readonly effect: string | null;
      readonly trigger: string | null;
    }
  | undefined => {
  if (isPoneglyphCardProbePayload(value)) {
    return {
      card_number: value.card_number,
      effect: value.effect,
      trigger: value.trigger ?? null,
    };
  }
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const data = (value as Record<string, unknown>)["data"];
  return isPoneglyphCardProbePayload(data)
    ? {
        card_number: data.card_number,
        effect: data.effect,
        trigger: data.trigger ?? null,
      }
    : undefined;
};

const toPoneglyphCardProbeBatchPayload = (
  value: unknown,
):
  | {
      readonly data: Record<
        string,
        {
          readonly card_number: CardId;
          readonly effect: string | null;
          readonly trigger: string | null;
        }
      >;
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
  const cards: Record<
    string,
    {
      readonly card_number: CardId;
      readonly effect: string | null;
      readonly trigger: string | null;
    }
  > = {};
  for (const [cardId, card] of Object.entries(data)) {
    const payload = toPoneglyphCardProbePayload(card);
    if (payload === undefined) {
      return undefined;
    }
    cards[cardId] = payload;
  }
  return { data: cards, missing };
};
