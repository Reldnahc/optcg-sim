import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { evaluateEffectBlockRuntimeSupport } from "@optcg/engine-core";
import type { CardId, EffectBlock } from "@optcg/types";

import { parseCardEffectLineDetailed } from "./card-effect-line-parser.js";
import type { ParsedEffectLine } from "./types.js";

export interface SupportProbeRequest {
  readonly text?: string;
  readonly cardId?: string;
}

export interface SupportProbeReport {
  readonly exitCode: number;
  readonly lines: readonly string[];
  readonly errors: readonly string[];
}

interface PoneglyphFixture {
  readonly cardId: string;
  readonly effect: string;
}

const fixtureDirectory = fileURLToPath(
  new URL("../../../fixtures/poneglyph/cards/", import.meta.url),
);

export const createSupportProbeReport = (
  request: SupportProbeRequest,
): SupportProbeReport => {
  if (request.cardId !== undefined && request.cardId.length > 0) {
    return createCardSupportProbeReport(request.cardId);
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

export const findPoneglyphFixtureByCardId = (
  cardId: string,
): PoneglyphFixture | undefined => {
  const prefix = `${cardId.toUpperCase()}.`;
  const fileName = readdirSync(fixtureDirectory).find((entry) =>
    entry.toUpperCase().startsWith(prefix),
  );
  if (fileName === undefined) {
    return undefined;
  }

  const parsed = JSON.parse(
    readFileSync(`${fixtureDirectory}/${fileName}`, "utf8"),
  ) as unknown;
  if (!isFixtureObject(parsed)) {
    return undefined;
  }

  return {
    cardId: parsed.card_number,
    effect: parsed.effect,
  };
};

const createCardSupportProbeReport = (cardId: string): SupportProbeReport => {
  const fixture = findPoneglyphFixtureByCardId(cardId);
  if (fixture === undefined) {
    return {
      exitCode: 1,
      lines: [],
      errors: [`Card fixture not found: ${cardId}`],
    };
  }

  const lines = [`Card ID: ${fixture.cardId}`];
  const effectLines = fixture.effect
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

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
      readonly parseOk: true;
      readonly value: ParsedEffectLine;
      readonly runtimeSupported: boolean;
      readonly runtimeReason?: string;
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
  const parsed = parseCardEffectLineDetailed(text);
  if (!parsed.ok) {
    return {
      parseOk: false,
      stage: parsed.diagnostic.stage,
      reason: parsed.diagnostic.reason,
      text: parsed.diagnostic.text,
    };
  }

  const runtimeSupport = evaluateEffectBlockRuntimeSupport(
    toEffectBlock(parsed.value, effectId),
  );
  return {
    parseOk: true,
    value: parsed.value,
    runtimeSupported: runtimeSupport.supported,
    ...(runtimeSupport.reason === undefined
      ? {}
      : { runtimeReason: runtimeSupport.reason }),
  };
};

const toEffectBlock = (
  line: ParsedEffectLine,
  effectId: string,
): EffectBlock => ({
  id: effectId as EffectBlock["id"],
  category: line.block.category,
  trigger: line.block.trigger,
  ...(line.block.condition === undefined
    ? {}
    : { condition: line.block.condition }),
  ...(line.block.cost === undefined ? {} : { cost: line.block.cost }),
  sourcePresencePolicy: line.block.sourcePresencePolicy,
  ...(line.block.oncePerTurn === true ? { oncePerTurn: true } : {}),
  effect: line.block.effect,
});

const runtimeReason = (
  lineReport: Extract<ParsedLineReport, { readonly parseOk: true }>,
): string => lineReport.runtimeReason ?? "unsupported runtime effect shape";

const isFixtureObject = (
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
