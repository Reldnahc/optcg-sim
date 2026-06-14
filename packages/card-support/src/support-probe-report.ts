import { evaluateEffectBlockRuntimeSupport } from "@optcg/engine-core";
import type {
  CardId,
  EffectBlock,
  ParserSupportCertificate,
  RuntimeSupportReport,
} from "@optcg/types";
import {
  createParserSupportCertificate,
  gameplayLinesFromTextParts,
  parseCardEffectLinesDetailed,
  parseRawKeywordLine,
  type ParsedEffectLine,
  type ParsedRuntimeEffectLine,
} from "@optcg/cards";
import {
  createApiDeckHashDictionarySource,
  createDeckHashCodec,
  type DeckHashDeck,
} from "optcg-deck-hash";

import {
  formatPrimitiveSupportSections,
  prefixPrimitiveSupportLines,
} from "./primitive-support-output.js";

export interface SupportProbeRequest {
  readonly text?: string;
  readonly cardId?: string;
  readonly deckHash?: string;
  readonly setCode?: string;
  readonly deckHashOutput?: "report" | "unsupportedTextLines";
  readonly deckHashCodec?: DeckHashCodecPort;
  readonly fetchCard?: PoneglyphFetch;
  readonly baseUrl?: string;
}

export interface SupportProbeReport {
  readonly exitCode: number;
  readonly lines: readonly string[];
  readonly errors: readonly string[];
}

interface PoneglyphCardProbePayload {
  readonly cardId: string;
  readonly effect: string | null;
  readonly trigger: string | null;
}

interface PoneglyphFetchResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

interface PoneglyphFetchRequest {
  readonly method?: "GET" | "POST";
  readonly headers?: Record<string, string>;
  readonly body?: string;
}

type PoneglyphFetch = (
  url: string | URL,
  init?: PoneglyphFetchRequest,
) => Promise<PoneglyphFetchResponse>;

const defaultPoneglyphBaseUrl = "https://api.poneglyph.one";
const maxBatchCardCount = 60;

export interface DeckHashCodecPort {
  readonly decode: (hash: string) => Promise<DeckHashDeck>;
}

const createPoneglyphDeckHashCodec = (): DeckHashCodecPort => {
  const codec = createDeckHashCodec({
    dictionarySource: createApiDeckHashDictionarySource({
      baseUrl: "https://poneglyph.one",
    }),
  });
  return {
    decode: (hash) => codec.decode(hash),
  };
};

export const createSupportProbeReport = async (
  request: SupportProbeRequest,
): Promise<SupportProbeReport> => {
  if (request.deckHash !== undefined && request.deckHash.length > 0) {
    return createDeckHashSupportProbeReport(request.deckHash, {
      baseUrl: request.baseUrl ?? defaultPoneglyphBaseUrl,
      deckHashCodec: request.deckHashCodec ?? createPoneglyphDeckHashCodec(),
      output: request.deckHashOutput ?? "report",
      fetchCard: request.fetchCard ?? fetchPoneglyphCard,
    });
  }

  if (request.setCode !== undefined && request.setCode.length > 0) {
    return createSetSupportProbeReport(request.setCode, {
      baseUrl: request.baseUrl ?? defaultPoneglyphBaseUrl,
      output: request.deckHashOutput ?? "report",
      fetchCard: request.fetchCard ?? fetchPoneglyphCard,
    });
  }

  if (request.cardId !== undefined && request.cardId.length > 0) {
    return createCardSupportProbeReport(request.cardId, {
      baseUrl: request.baseUrl ?? defaultPoneglyphBaseUrl,
      fetchCard: request.fetchCard ?? fetchPoneglyphCard,
    });
  }

  if (request.text === undefined || request.text.length === 0) {
    return {
      exitCode: 1,
      lines: [],
      errors: [
        "Usage: support:probe -- --text <effect line> | --card <card id> | --deck-hash <hash> | --set <set code> [--raw-unsupported-lines]",
      ],
    };
  }

  return createTextLineReport(request.text);
};

interface DeckHashProbeEntry {
  readonly cardId: string;
  readonly count: number;
  readonly variantIndex?: number;
}

interface AggregatedDeckHashProbeEntry {
  readonly cardId: string;
  readonly count: number;
  readonly variantIndexes: readonly number[];
}

const createDeckHashSupportProbeReport = async (
  deckHash: string,
  options: {
    readonly baseUrl: string;
    readonly deckHashCodec: DeckHashCodecPort;
    readonly output: "report" | "unsupportedTextLines";
    readonly fetchCard: PoneglyphFetch;
  },
): Promise<SupportProbeReport> => {
  const decoded = await decodeProbeDeckHash(deckHash, options.deckHashCodec);
  if (!decoded.ok) {
    return {
      exitCode: 1,
      lines: [],
      errors: [`Deck hash decode failed: ${decoded.error}`],
    };
  }

  const cards = aggregateDeckHashEntries(decoded.entries);
  const totalCount = cards.reduce((sum, entry) => sum + entry.count, 0);
  const probed = await probeAggregatedCards(cards, options);

  if (options.output === "unsupportedTextLines") {
    return {
      exitCode: probed.exitCode,
      lines: probed.unsupportedTextLines,
      errors: [],
    };
  }

  const lines = [
    `Deck hash: ${deckHash}`,
    `Cards: ${String(cards.length)} unique / ${String(totalCount)} total`,
    probed.failedCardCount === 0
      ? "Failures: none"
      : `Failures: ${String(probed.failedCardCount)} card${
          probed.failedCardCount === 1 ? "" : "s"
        }`,
    ...probed.failureLines,
  ];

  return { exitCode: probed.exitCode, lines, errors: [] };
};

const decodeProbeDeckHash = async (
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
      entries: [
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
      ],
    };
  } catch (error: unknown) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

const aggregateDeckHashEntries = (
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

const deckHashEntryLine = (entry: AggregatedDeckHashProbeEntry): string => {
  const variants =
    entry.variantIndexes.length === 0
      ? ""
      : ` variants: ${entry.variantIndexes.join(", ")}`;
  return `Card ID: ${entry.cardId} x${String(entry.count)}${variants}`;
};

const createSetSupportProbeReport = async (
  setCode: string,
  options: {
    readonly baseUrl: string;
    readonly output: "report" | "unsupportedTextLines";
    readonly fetchCard: PoneglyphFetch;
  },
): Promise<SupportProbeReport> => {
  const normalizedSetCode = setCode.trim().toUpperCase();
  const fetchedSet = await fetchPoneglyphSetCardIds(normalizedSetCode, options);
  if (!fetchedSet.ok) {
    return {
      exitCode: 1,
      lines: [],
      errors: [fetchedSet.error],
    };
  }

  const cards = fetchedSet.cardIds.map((cardId) => ({
    cardId,
    count: 1,
    variantIndexes: [],
  }));
  const probed = await probeAggregatedCards(cards, options);

  if (options.output === "unsupportedTextLines") {
    return {
      exitCode: probed.exitCode,
      lines: probed.unsupportedTextLines,
      errors: [],
    };
  }

  const lines = [
    `Set: ${normalizedSetCode}`,
    `Cards: ${String(cards.length)}`,
    probed.failedCardCount === 0
      ? "Failures: none"
      : `Failures: ${String(probed.failedCardCount)} card${
          probed.failedCardCount === 1 ? "" : "s"
        }`,
    ...probed.failureLines,
  ];

  return { exitCode: probed.exitCode, lines, errors: [] };
};

const probeAggregatedCards = async (
  cards: readonly AggregatedDeckHashProbeEntry[],
  options: {
    readonly baseUrl: string;
    readonly fetchCard: PoneglyphFetch;
  },
): Promise<{
  readonly exitCode: number;
  readonly failureLines: readonly string[];
  readonly unsupportedTextLines: readonly string[];
  readonly failedCardCount: number;
}> => {
  const fetchedCards = await fetchPoneglyphCardPayloads(
    cards.map((card) => card.cardId),
    options,
  );
  const failureLines: string[] = [];
  const unsupportedTextLines: string[] = [];
  let failedCardCount = 0;
  let exitCode = 0;

  for (const card of cards) {
    const cardFailureLines: string[] = [];
    const fetched = fetchedCards.get(card.cardId) ?? {
      ok: false,
      error: `Poneglyph card fetch failed for ${card.cardId}: missing batch result`,
    };
    if (!fetched.ok) {
      exitCode = 1;
      cardFailureLines.push(`${card.cardId} fetch: failed`);
      cardFailureLines.push(`${card.cardId} fetch reason: ${fetched.error}`);
      failedCardCount += 1;
      failureLines.push(deckHashEntryLine(card), ...cardFailureLines);
      continue;
    }

    const effectLines = gameplayLinesFromTextParts([
      fetched.card.effect,
      fetched.card.trigger,
    ]);
    for (const [index, text] of effectLines.entries()) {
      const lineNumber = index + 1;
      const lineReport = evaluateParsedLine(
        text,
        `${card.cardId}:line:${String(lineNumber)}`,
      );
      if (!lineReport.parseOk) {
        exitCode = 1;
        unsupportedTextLines.push(text);
        cardFailureLines.push(
          `${card.cardId} line ${String(lineNumber)} text: ${text}`,
        );
        cardFailureLines.push(
          `${card.cardId} line ${String(lineNumber)} parse: failed`,
        );
        cardFailureLines.push(
          `${card.cardId} line ${String(lineNumber)} stage: ${lineReport.stage}`,
        );
        cardFailureLines.push(
          `${card.cardId} line ${String(lineNumber)} reason: ${lineReport.reason}`,
        );
        continue;
      }

      if (!lineReport.runtimeSupported) {
        exitCode = 1;
        unsupportedTextLines.push(text);
        cardFailureLines.push(
          `${card.cardId} line ${String(lineNumber)} text: ${text}`,
        );
        cardFailureLines.push(
          `${card.cardId} line ${String(lineNumber)} parse: passed`,
        );
        cardFailureLines.push(
          `${card.cardId} line ${String(lineNumber)} engine runtime: failed`,
        );
        cardFailureLines.push(
          `${card.cardId} line ${String(lineNumber)} engine runtime reason: ${runtimeReason(lineReport)}`,
        );
        cardFailureLines.push(
          ...prefixPrimitiveSupportLines(
            `${card.cardId} line ${String(lineNumber)} `,
            formatPrimitiveSupportSections({
              parserCertificate: lineReport.parserCertificate,
              runtimeReports: lineReport.runtimeReports,
            }),
          ),
        );
      }
    }

    if (cardFailureLines.length > 0) {
      failedCardCount += 1;
      failureLines.push(deckHashEntryLine(card), ...cardFailureLines);
    }
  }

  return {
    exitCode,
    failureLines,
    unsupportedTextLines,
    failedCardCount,
  };
};

const createCardSupportProbeReport = async (
  cardId: string,
  options: {
    readonly baseUrl: string;
    readonly fetchCard: PoneglyphFetch;
  },
): Promise<SupportProbeReport> => {
  const fetched = await fetchPoneglyphCardPayload(cardId, options);
  if (!fetched.ok) {
    return {
      exitCode: 1,
      lines: [],
      errors: [fetched.error],
    };
  }

  const lines = [`Card ID: ${fetched.card.cardId}`];
  const effectLines = gameplayLinesFromTextParts([
    fetched.card.effect,
    fetched.card.trigger,
  ]);

  let exitCode = 0;
  for (const [index, text] of effectLines.entries()) {
    const lineNumber = index + 1;
    const lineReport = evaluateParsedLine(text, `line:${String(lineNumber)}`);
    lines.push(`Line ${String(lineNumber)} text: ${text}`);
    if (!lineReport.parseOk) {
      exitCode = 1;
      lines.push(`Line ${String(lineNumber)} parse: failed`);
      lines.push(`Line ${String(lineNumber)} stage: ${lineReport.stage}`);
      lines.push(`Line ${String(lineNumber)} reason: ${lineReport.reason}`);
      continue;
    }

    lines.push(`Line ${String(lineNumber)} parse: passed`);
    lines.push(
      `Line ${String(lineNumber)} engine runtime: ${
        lineReport.runtimeSupported ? "passed" : "failed"
      }`,
    );
    if (!lineReport.runtimeSupported) {
      exitCode = 1;
      lines.push(
        `Line ${String(lineNumber)} engine runtime reason: ${runtimeReason(lineReport)}`,
      );
    }
    if (lineReport.kind === "effect") {
      lines.push(
        ...prefixPrimitiveSupportLines(
          `Line ${String(lineNumber)} `,
          formatPrimitiveSupportSections({
            parserCertificate: lineReport.parserCertificate,
            runtimeReports: lineReport.runtimeReports,
          }),
        ),
      );
    }
  }

  return { exitCode, lines, errors: [] };
};

const fetchPoneglyphCardPayload = async (
  cardId: string,
  options: {
    readonly baseUrl: string;
    readonly fetchCard: PoneglyphFetch;
  },
): Promise<
  | { readonly ok: true; readonly card: PoneglyphCardProbePayload }
  | { readonly ok: false; readonly error: string }
> => {
  const url = `${options.baseUrl.replace(/\/+$/u, "")}/v1/cards/${encodeURIComponent(cardId)}`;
  const response = await options.fetchCard(url);
  if (!response.ok) {
    return {
      ok: false,
      error: `Poneglyph card fetch failed for ${cardId}: HTTP ${String(response.status)}`,
    };
  }

  const payload = await response.json();
  const cardPayload = toPoneglyphCardProbePayload(payload);
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

const fetchPoneglyphCardPayloads = async (
  cardIds: readonly string[],
  options: {
    readonly baseUrl: string;
    readonly fetchCard: PoneglyphFetch;
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

const fetchPoneglyphCardPayloadBatch = async (
  cardIds: readonly string[],
  options: {
    readonly baseUrl: string;
    readonly fetchCard: PoneglyphFetch;
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
  const response = await options.fetchCard(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ card_numbers: cardIds }),
  });
  if (!response.ok) {
    return {
      ok: false,
      error: `Poneglyph card batch fetch failed: HTTP ${String(response.status)}`,
    };
  }

  const payload = await response.json();
  const batch = toPoneglyphCardProbeBatchPayload(payload);
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

const fetchPoneglyphSetCardIds = async (
  setCode: string,
  options: {
    readonly baseUrl: string;
    readonly fetchCard: PoneglyphFetch;
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
    const response = await options.fetchCard(url);
    if (!response.ok) {
      return {
        ok: false,
        error: `Poneglyph set catalog fetch failed for ${setCode}: HTTP ${String(response.status)}`,
      };
    }
    const payload = await response.json();
    const catalog = toPoneglyphCardCatalogPayload(payload);
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

const createTextLineReport = (text: string): SupportProbeReport => {
  const lineReport = evaluateParsedLine(text, "line:1");
  const lines: string[] = [];
  if (!lineReport.parseOk) {
    lines.push("Parse: failed");
    lines.push(`Stage: ${lineReport.stage}`);
    lines.push(`Reason: ${lineReport.reason}`);
    lines.push(`Text: ${lineReport.text}`);
    return { exitCode: 1, lines, errors: [] };
  }

  lines.push("Parse: passed");
  if (lineReport.kind === "rawKeyword") {
    lines.push("Kind: raw keyword");
    lines.push(`Keyword: ${lineReport.keyword}`);
    lines.push("Engine runtime: passed");
    return {
      exitCode: 0,
      lines,
      errors: [],
    };
  }
  if (lineReport.kind === "metadata") {
    lines.push("Kind: metadata");
    lines.push("Engine runtime: not applicable");
    lines.push("Evidence:");
    for (const evidence of lineReport.value.evidence) {
      lines.push(`- ${evidence}`);
    }
    return {
      exitCode: 0,
      lines,
      errors: [],
    };
  }

  if (lineReport.values.length === 1) {
    const value = lineReport.values[0];
    if (value !== undefined) {
      lines.push(`Trigger: ${value.block.trigger.type}`);
      lines.push(`Category: ${value.block.category}`);
      lines.push(`Source presence: ${value.block.sourcePresencePolicy}`);
      if (value.block.oncePerTurn === true) {
        lines.push("Once per turn: true");
      }
    }
  } else {
    lines.push(`Blocks: ${String(lineReport.values.length)}`);
    for (const [index, value] of lineReport.values.entries()) {
      lines.push(
        `Block ${String(index + 1)} trigger: ${value.block.trigger.type}`,
      );
      lines.push(
        `Block ${String(index + 1)} category: ${value.block.category}`,
      );
      lines.push(
        `Block ${String(index + 1)} source presence: ${
          value.block.sourcePresencePolicy
        }`,
      );
    }
  }
  lines.push(
    `Engine runtime: ${lineReport.runtimeSupported ? "passed" : "failed"}`,
  );
  if (!lineReport.runtimeSupported) {
    lines.push(`Engine runtime reason: ${runtimeReason(lineReport)}`);
  }
  lines.push(
    ...formatPrimitiveSupportSections({
      parserCertificate: lineReport.parserCertificate,
      runtimeReports: lineReport.runtimeReports,
    }),
  );
  lines.push("Diagnostics:");
  lines.push("Parser evidence diagnostics:");
  for (const evidence of uniqueEvidence(lineReport.values)) {
    lines.push(`- ${evidence}`);
  }
  const sourceSpanLines = sourceSpanDiagnostics(lineReport.values);
  if (sourceSpanLines.length > 0) {
    lines.push("Source spans:", ...sourceSpanLines);
  }

  return {
    exitCode: lineReport.runtimeSupported ? 0 : 1,
    lines,
    errors: [],
  };
};

type ParsedLineReport =
  | {
      readonly kind: "effect";
      readonly parseOk: true;
      readonly values: readonly Extract<
        ParsedEffectLine,
        { readonly block: unknown }
      >[];
      readonly runtimeSupported: boolean;
      readonly runtimeReason?: string;
      readonly parserCertificate: ParserSupportCertificate;
      readonly runtimeReports: readonly RuntimeSupportReport[];
    }
  | {
      readonly kind: "metadata";
      readonly parseOk: true;
      readonly value: Extract<ParsedEffectLine, { readonly kind: "metadata" }>;
      readonly runtimeSupported: true;
    }
  | {
      readonly kind: "rawKeyword";
      readonly parseOk: true;
      readonly keyword: string;
      readonly runtimeSupported: true;
    }
  | {
      readonly parseOk: false;
      readonly stage: string;
      readonly reason: string;
      readonly text: string;
    };

const evaluateParsedLine = (
  text: string,
  effectId: string,
): ParsedLineReport => {
  const rawKeyword = parseRawKeywordLine({ text });
  if (rawKeyword !== undefined) {
    return {
      kind: "rawKeyword",
      parseOk: true,
      keyword: rawKeyword.keyword,
      runtimeSupported: true,
    };
  }

  const parsed = parseCardEffectLinesDetailed(text);
  if (!parsed.ok) {
    return {
      parseOk: false,
      stage: parsed.diagnostic.stage,
      reason: parsed.diagnostic.reason,
      text: parsed.diagnostic.text,
    };
  }
  const metadata = parsed.value.find(
    (
      value,
    ): value is Extract<ParsedEffectLine, { readonly kind: "metadata" }> =>
      value.kind === "metadata",
  );
  if (metadata !== undefined) {
    return {
      kind: "metadata",
      parseOk: true,
      value: metadata,
      runtimeSupported: true,
    };
  }

  const values = parsed.value.filter(
    (value): value is ParsedRuntimeEffectLine => value.kind !== "metadata",
  );
  const parserCertificate = createParserSupportCertificate(values);
  const runtimeResults = values.map((value, index) =>
    evaluateEffectBlockRuntimeSupport({
      ...value.block,
      id:
        values.length === 1
          ? (effectId as EffectBlock["id"])
          : (`${effectId}:${String(index + 1)}` as EffectBlock["id"]),
    }),
  );
  const firstFailure = runtimeResults.find((result) => !result.supported);
  const runtimeSupported =
    parserCertificate.complete &&
    runtimeResults.length > 0 &&
    firstFailure === undefined;
  return {
    kind: "effect",
    parseOk: true,
    values,
    runtimeSupported,
    ...(firstFailure?.reason === undefined
      ? {}
      : { runtimeReason: firstFailure.reason }),
    parserCertificate,
    runtimeReports: runtimeResults,
  };
};

const runtimeReason = (
  lineReport: Extract<
    ParsedLineReport,
    { readonly parseOk: true; readonly kind: "effect" }
  >,
): string => lineReport.runtimeReason ?? "unsupported runtime effect shape";

const uniqueEvidence = (
  values: readonly Extract<ParsedEffectLine, { readonly block: unknown }>[],
): readonly string[] => {
  const evidence = new Set<string>();
  for (const value of values) {
    for (const entry of value.evidence) {
      evidence.add(entry);
    }
  }
  return [...evidence];
};

const sourceSpanDiagnostics = (
  values: readonly Extract<ParsedEffectLine, { readonly block: unknown }>[],
): readonly string[] =>
  values.flatMap((value) =>
    (value.sourceMap?.spans ?? []).map((span) => {
      const evidence = span.primitiveEvidence?.[0] ?? span.role;
      return `- ${span.id} [${String(span.start)}, ${String(span.end)}] ${evidence}`;
    }),
  );

const fetchPoneglyphCard: PoneglyphFetch = async (url, init) =>
  fetch(url, init);

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
