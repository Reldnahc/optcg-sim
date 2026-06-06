import { evaluateEffectBlockRuntimeSupport } from "@optcg/engine-core";
import type { CardId, EffectBlock } from "@optcg/types";
import {
  createApiDeckHashDictionarySource,
  createDeckHashCodec,
  type DeckHashDeck,
} from "optcg-deck-hash";

import { parseCardEffectLinesDetailed } from "./card-effect-line-parser.js";
import { gameplayLinesFromTextParts } from "./effect-text-lines.js";
import { parseRawKeywordLine } from "./keywords/index.js";
import type { ParsedEffectLine } from "./types.js";

export interface SupportProbeRequest {
  readonly text?: string;
  readonly cardId?: string;
  readonly deckHash?: string;
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

type PoneglyphFetch = (url: string) => Promise<PoneglyphFetchResponse>;

const defaultPoneglyphBaseUrl = "https://api.poneglyph.one";

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
        "Usage: support:probe -- --text <effect line> | --card <card id> | --deck-hash <hash> [--raw-unsupported-lines]",
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
  const failureLines: string[] = [];
  const unsupportedTextLines: string[] = [];
  let failedCardCount = 0;
  let exitCode = 0;

  for (const card of cards) {
    const cardFailureLines: string[] = [];
    const fetched = await fetchPoneglyphCardPayload(card.cardId, options);
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
      }
    }

    if (cardFailureLines.length > 0) {
      failedCardCount += 1;
      failureLines.push(deckHashEntryLine(card), ...cardFailureLines);
    }
  }

  if (options.output === "unsupportedTextLines") {
    return { exitCode, lines: unsupportedTextLines, errors: [] };
  }

  const lines = [
    `Deck hash: ${deckHash}`,
    `Cards: ${String(cards.length)} unique / ${String(totalCount)} total`,
    failedCardCount === 0
      ? "Failures: none"
      : `Failures: ${String(failedCardCount)} card${
          failedCardCount === 1 ? "" : "s"
        }`,
    ...failureLines,
  ];

  return { exitCode, lines, errors: [] };
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

const deckHashEntryLine = (entry: AggregatedDeckHashProbeEntry): string => {
  const variants =
    entry.variantIndexes.length === 0
      ? ""
      : ` variants: ${entry.variantIndexes.join(", ")}`;
  return `Card ID: ${entry.cardId} x${String(entry.count)}${variants}`;
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
  lines.push("Evidence:");
  for (const evidence of uniqueEvidence(lineReport.values)) {
    lines.push(`- ${evidence}`);
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
    (value): value is Extract<ParsedEffectLine, { readonly block: unknown }> =>
      value.kind !== "metadata",
  );
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
  return {
    kind: "effect",
    parseOk: true,
    values,
    runtimeSupported: firstFailure === undefined,
    ...(firstFailure?.reason === undefined
      ? {}
      : { runtimeReason: firstFailure.reason }),
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

const fetchPoneglyphCard: PoneglyphFetch = async (url) => fetch(url);

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
