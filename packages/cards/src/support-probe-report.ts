import { evaluateEffectBlockRuntimeSupport } from "@optcg/engine-core";
import type { CardId, EffectBlock } from "@optcg/types";

import { parseCardEffectLineDetailed } from "./card-effect-line-parser.js";
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

  lines.push(`Trigger: ${lineReport.value.block.trigger.type}`);
  lines.push(`Category: ${lineReport.value.block.category}`);
  lines.push(`Source presence: ${lineReport.value.block.sourcePresencePolicy}`);
  if (lineReport.value.block.oncePerTurn === true) {
    lines.push("Once per turn: true");
  }
  lines.push(
    `Engine runtime: ${lineReport.runtimeSupported ? "passed" : "failed"}`,
  );
  if (!lineReport.runtimeSupported) {
    lines.push(`Engine runtime reason: ${runtimeReason(lineReport)}`);
  }
  lines.push("Evidence:");
  for (const evidence of lineReport.value.evidence) {
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
      readonly value: Extract<ParsedEffectLine, { readonly block: unknown }>;
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

  const parsed = parseCardEffectLineDetailed(text);
  if (!parsed.ok) {
    return {
      parseOk: false,
      stage: parsed.diagnostic.stage,
      reason: parsed.diagnostic.reason,
      text: parsed.diagnostic.text,
    };
  }
  if (parsed.value.kind === "metadata") {
    return {
      kind: "metadata",
      parseOk: true,
      value: parsed.value,
      runtimeSupported: true,
    };
  }

  const runtimeSupport = evaluateEffectBlockRuntimeSupport({
    ...parsed.value.block,
    id: effectId as EffectBlock["id"],
  });
  return {
    kind: "effect",
    parseOk: true,
    value: parsed.value,
    runtimeSupported: runtimeSupport.supported,
    ...(runtimeSupport.reason === undefined
      ? {}
      : { runtimeReason: runtimeSupport.reason }),
  };
};

const runtimeReason = (
  lineReport: Extract<
    ParsedLineReport,
    { readonly parseOk: true; readonly kind: "effect" }
  >,
): string => lineReport.runtimeReason ?? "unsupported runtime effect shape";

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
