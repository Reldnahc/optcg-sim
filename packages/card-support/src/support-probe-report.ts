import type { CardId } from "@optcg/types";
import { gameplayLinesFromTextParts } from "@optcg/cards";

import {
  formatPrimitiveSupportSections,
  prefixPrimitiveSupportLines,
} from "./primitive-support-output.js";
import {
  aggregateDeckHashEntries,
  createPoneglyphDeckHashCodec,
  decodeProbeDeckHash,
  defaultPoneglyphBaseUrl,
  fetchPoneglyphCard,
  fetchPoneglyphCardPayload,
  fetchPoneglyphCardPayloads,
  fetchPoneglyphSetCardIds,
  type AggregatedDeckHashProbeEntry,
  type DeckHashCodecPort,
  type PoneglyphFetch,
} from "./poneglyph-card-source.js";
import {
  runtimeContextForEffectLines,
} from "./support-probe-runtime-context.js";
import {
  evaluateRulesTextLine,
  type RulesTextEffectLineEvaluation,
} from "./rules-text-validator.js";

export type { DeckHashCodecPort } from "./poneglyph-card-source.js";

export interface SupportProbeRequest {
  readonly text?: string;
  readonly cardId?: string;
  readonly deckHash?: string;
  readonly setCode?: string;
  readonly setCodes?: readonly string[];
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

export const createSupportProbeReport = async (
  request: SupportProbeRequest,
): Promise<SupportProbeReport> => {
  if (request.deckHash !== undefined && request.deckHash.length > 0) {
    return createDeckHashSupportProbeReport(request.deckHash, {
      baseUrl: request.baseUrl ?? defaultPoneglyphBaseUrl,
      deckHashCodec: request.deckHashCodec ?? createPoneglyphDeckHashCodec(),
      output: request.deckHashOutput ?? "report",
      fetchPoneglyph: request.fetchCard ?? fetchPoneglyphCard,
    });
  }

  if (request.setCode !== undefined && request.setCode.length > 0) {
    return createSetSupportProbeReport(request.setCode, {
      baseUrl: request.baseUrl ?? defaultPoneglyphBaseUrl,
      output: request.deckHashOutput ?? "report",
      fetchPoneglyph: request.fetchCard ?? fetchPoneglyphCard,
    });
  }

  const requestedSetCodes = normalizedSetCodes(request.setCodes ?? []);
  if (requestedSetCodes.length > 0) {
    return createMultiSetSupportProbeReport(requestedSetCodes, {
      baseUrl: request.baseUrl ?? defaultPoneglyphBaseUrl,
      output: request.deckHashOutput ?? "report",
      fetchPoneglyph: request.fetchCard ?? fetchPoneglyphCard,
    });
  }

  if (request.cardId !== undefined && request.cardId.length > 0) {
    return createCardSupportProbeReport(request.cardId, {
      baseUrl: request.baseUrl ?? defaultPoneglyphBaseUrl,
      fetchPoneglyph: request.fetchCard ?? fetchPoneglyphCard,
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

const normalizedSetCodes = (setCodes: readonly string[]): readonly string[] =>
  uniqueStrings(
    setCodes
      .map((setCode) => setCode.trim().toUpperCase())
      .filter((setCode) => setCode.length > 0),
  );

const createDeckHashSupportProbeReport = async (
  deckHash: string,
  options: {
    readonly baseUrl: string;
    readonly deckHashCodec: DeckHashCodecPort;
    readonly output: "report" | "unsupportedTextLines";
    readonly fetchPoneglyph: PoneglyphFetch;
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
    readonly fetchPoneglyph: PoneglyphFetch;
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

const createMultiSetSupportProbeReport = async (
  setCodes: readonly string[],
  options: {
    readonly baseUrl: string;
    readonly output: "report" | "unsupportedTextLines";
    readonly fetchPoneglyph: PoneglyphFetch;
  },
): Promise<SupportProbeReport> => {
  const cardIds: CardId[] = [];
  for (const setCode of setCodes) {
    const fetchedSet = await fetchPoneglyphSetCardIds(setCode, options);
    if (!fetchedSet.ok) {
      return {
        exitCode: 1,
        lines: [],
        errors: [fetchedSet.error],
      };
    }
    cardIds.push(...fetchedSet.cardIds);
  }

  const cards = uniqueStrings(cardIds).map((cardId) => ({
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
    `Sets: ${setCodes.join(", ")}`,
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
    readonly fetchPoneglyph: PoneglyphFetch;
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
    const runtimeContext = runtimeContextForEffectLines(
      effectLines,
      (lineNumber) => `${card.cardId}:line:${String(lineNumber)}`,
    );
    for (const [index, text] of effectLines.entries()) {
      const lineNumber = index + 1;
      const lineReport = evaluateRulesTextLine(
        text,
        `${card.cardId}:line:${String(lineNumber)}`,
        runtimeContext,
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

const uniqueStrings = (values: readonly string[]): string[] => [
  ...new Set(values),
];

const createCardSupportProbeReport = async (
  cardId: string,
  options: {
    readonly baseUrl: string;
    readonly fetchPoneglyph: PoneglyphFetch;
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
  const runtimeContext = runtimeContextForEffectLines(
    effectLines,
    (lineNumber) => `line:${String(lineNumber)}`,
  );

  let exitCode = 0;
  for (const [index, text] of effectLines.entries()) {
    const lineNumber = index + 1;
    const lineReport = evaluateRulesTextLine(
      text,
      `line:${String(lineNumber)}`,
      runtimeContext,
    );
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

const createTextLineReport = (text: string): SupportProbeReport => {
  const lineReport = evaluateRulesTextLine(text, "line:1");
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
  const primitiveSupportLines = formatPrimitiveSupportSections({
    parserCertificate: lineReport.parserCertificate,
    runtimeReports: lineReport.runtimeReports,
  });
  lines.push(...primitiveSupportLines);
  lines.push(...prefixPrimitiveSupportLines("Line 1 ", primitiveSupportLines));
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

const runtimeReason = (
  lineReport: RulesTextEffectLineEvaluation,
): string => lineReport.runtimeReason ?? "unsupported runtime effect shape";

const uniqueEvidence = (
  values: RulesTextEffectLineEvaluation["values"],
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
  values: RulesTextEffectLineEvaluation["values"],
): readonly string[] =>
  values.flatMap((value) =>
    (value.sourceMap?.spans ?? []).map((span) => {
      const evidence = span.primitiveEvidence?.[0] ?? span.role;
      return `- ${span.id} [${String(span.start)}, ${String(span.end)}] ${evidence}`;
    }),
  );
