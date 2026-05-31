import { evaluateEffectBlockRuntimeSupport } from "@optcg/engine-core";
import type { CardId, EffectBlock } from "@optcg/types";

import { parseCardEffectLinesDetailed } from "./card-effect-line-parser.js";
import { gameplayLinesFromTextParts } from "./effect-text-lines.js";
import { parseRawKeywordLine } from "./keywords/index.js";
import type { ParsedEffectLine } from "./types.js";

export interface SupportProbeRequest {
  readonly text?: string;
  readonly cardId?: string;
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
  readonly effect: string;
}

interface PoneglyphFetchResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

type PoneglyphFetch = (url: string) => Promise<PoneglyphFetchResponse>;

const defaultPoneglyphBaseUrl = "https://api.poneglyph.one";

export const createSupportProbeReport = async (
  request: SupportProbeRequest,
): Promise<SupportProbeReport> => {
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
      errors: ["Usage: support:probe -- --text <effect line>"],
    };
  }

  return createTextLineReport(request.text);
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
  const effectLines = gameplayLinesFromTextParts([fetched.card.effect]);

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
): value is { readonly card_number: CardId; readonly effect: string } => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate["card_number"] === "string" &&
    typeof candidate["effect"] === "string"
  );
};

const toPoneglyphCardProbePayload = (
  value: unknown,
): { readonly card_number: CardId; readonly effect: string } | undefined => {
  if (isPoneglyphCardProbePayload(value)) {
    return value;
  }
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const data = (value as Record<string, unknown>)["data"];
  return isPoneglyphCardProbePayload(data) ? data : undefined;
};
