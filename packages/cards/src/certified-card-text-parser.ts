import type { CardId, EffectBlock, EffectId } from "@optcg/types";

import type {
  GeneratedSupportParserResult,
  GeneratedSupportUnparsedSpan,
} from "./generated-support-types.js";

export const onPlayDrawOneParserRuleId = "exact:on-play:draw-1:self";
export const whenAttackingDrawOneParserRuleId =
  "exact:when-attacking:draw-1:self";
export const onPlayDrawNParserRuleId = "exact:on-play:draw-n:self";
export const whenAttackingDrawNParserRuleId =
  "exact:when-attacking:draw-n:self";
export const lineSeparatedEffectBlocksCompositionId =
  "line-separated-effect-blocks:v1";
export const certifiedParserRuleReviewer = "certified-parser-rule:CARD-009A";

export interface CertifiedCardTextParserInput {
  cardId: CardId;
  effectDefinitionsVersion: string;
  rulesVersion: string;
  sourceText: string;
  sourceTextHash: string;
}

interface CertifiedLineParse {
  readonly clause?: CertifiedClause;
  readonly unparsedSpan?: GeneratedSupportUnparsedSpan;
}

interface CertifiedClause {
  readonly effectBlock: EffectBlock;
  readonly parserRuleId: string;
}

interface ParsedResidueClause {
  readonly clause: CertifiedClause;
  readonly prefix: string;
}

export function parseCertifiedCardText(
  input: CertifiedCardTextParserInput,
): GeneratedSupportParserResult {
  const singleLineParse = parseSupportedSourceText(
    input.cardId,
    input.sourceText,
  );
  if (singleLineParse !== undefined) {
    return completeParse(input, [singleLineParse]);
  }

  const compositionParse = parseSupportedComposition(
    input.cardId,
    input.sourceText,
  );
  if (compositionParse !== undefined) {
    return completeParse(input, compositionParse);
  }

  const lines = input.sourceText.split("\n");
  const parsedClauses: CertifiedClause[] = [];
  const unparsedSpans: GeneratedSupportUnparsedSpan[] = [];
  let offset = 0;

  for (const line of lines) {
    const lineParse = parseCertifiedLine(input.cardId, line, offset);
    if (lineParse.clause !== undefined) {
      parsedClauses.push(lineParse.clause);
    }

    if (lineParse.unparsedSpan !== undefined) {
      unparsedSpans.push(lineParse.unparsedSpan);
    }

    if (
      lineParse.clause === undefined &&
      lineParse.unparsedSpan === undefined
    ) {
      unparsedSpans.push({
        end: offset + line.length,
        start: offset,
        text: line,
      });
    }

    offset += line.length + 1;
  }

  if (parsedClauses.length === 0) {
    return {
      blockers: unparsedSpans.map((span) => ({
        code: "unparsed-span",
        message: "Card text is not covered by certified parser rules.",
        span,
      })),
      cardId: input.cardId,
      parsedRuleIds: [],
      sourceText: input.sourceText,
      sourceTextHash: input.sourceTextHash,
      status: "partial",
      unparsedSpans,
    };
  }

  if (unparsedSpans.length > 0) {
    return {
      blockers: unparsedSpans.map((span) => ({
        code: "unparsed-span",
        message: "Unsupported card text remains after certified parsing.",
        span,
      })),
      cardId: input.cardId,
      parsedRuleIds: parsedClauses.map((clause) => clause.parserRuleId),
      sourceText: input.sourceText,
      sourceTextHash: input.sourceTextHash,
      status: "partial",
      unparsedSpans,
    };
  }

  return unsupportedWholeText(input);
}

function completeParse(
  input: CertifiedCardTextParserInput,
  parsedClauses: readonly CertifiedClause[],
): GeneratedSupportParserResult {
  return {
    cardId: input.cardId,
    effectDefinition: {
      cardId: input.cardId,
      effects: parsedClauses.map((clause) => clause.effectBlock),
      implementationStatus: "implemented-dsl",
      metadata: {
        effectDefinitionsVersion: input.effectDefinitionsVersion,
        generatedBy: "rule-parser",
        reviewer: certifiedParserRuleReviewer,
        rulesVersion: input.rulesVersion,
        sourceTextHash: input.sourceTextHash,
        tested: true,
      },
    },
    parserRuleIds: getCompleteParserRuleIds(parsedClauses),
    sourceText: input.sourceText,
    sourceTextHash: input.sourceTextHash,
    status: "complete",
  };
}

function unsupportedWholeText(
  input: CertifiedCardTextParserInput,
): GeneratedSupportParserResult {
  const span = {
    end: input.sourceText.length,
    start: 0,
    text: input.sourceText,
  };

  return {
    blockers: [
      {
        code: "unparsed-span",
        message: "Card text is not covered by certified parser rules.",
        span,
      },
    ],
    cardId: input.cardId,
    parsedRuleIds: [],
    sourceText: input.sourceText,
    sourceTextHash: input.sourceTextHash,
    status: "partial",
    unparsedSpans: [span],
  };
}

function parseCertifiedLine(
  cardId: CardId,
  line: string,
  offset: number,
): CertifiedLineParse {
  const onPlayClause = parseOnPlayDrawClause(cardId, line);
  if (onPlayClause !== undefined) {
    return {
      clause: onPlayClause,
    };
  }

  const whenAttackingClause = parseWhenAttackingDrawClause(cardId, line);
  if (whenAttackingClause !== undefined) {
    return {
      clause: whenAttackingClause,
    };
  }

  const onPlayResidue = parseOnPlayDrawResidueClause(cardId, line);
  if (onPlayResidue !== undefined) {
    return {
      clause: onPlayResidue.clause,
      unparsedSpan: residueSpan({
        offset,
        prefix: onPlayResidue.prefix,
        source: line,
      }),
    };
  }

  const whenAttackingResidue = parseWhenAttackingDrawResidueClause(
    cardId,
    line,
  );
  if (whenAttackingResidue !== undefined) {
    return {
      clause: whenAttackingResidue.clause,
      unparsedSpan: residueSpan({
        offset,
        prefix: whenAttackingResidue.prefix,
        source: line,
      }),
    };
  }

  return {};
}

function createOnPlayDrawClauseWithCount(
  cardId: CardId,
  count: number,
): CertifiedClause {
  return {
    effectBlock: createDrawEffectBlock({
      cardId,
      count,
      effectIdSuffix: `auto-on-play-draw-${String(count)}`,
      triggerType: "onPlay",
    }),
    parserRuleId: onPlayDrawNParserRuleId,
  };
}

function createWhenAttackingDrawClauseWithCount(
  cardId: CardId,
  count: number,
): CertifiedClause {
  return {
    effectBlock: createDrawEffectBlock({
      cardId,
      count,
      effectIdSuffix: `auto-when-attacking-draw-${String(count)}`,
      triggerType: "whenAttacking",
    }),
    parserRuleId: whenAttackingDrawNParserRuleId,
  };
}

function createDrawEffectBlock({
  cardId,
  count,
  effectIdSuffix,
  triggerType,
}: {
  cardId: CardId;
  count: number;
  effectIdSuffix: string;
  triggerType: "onPlay" | "whenAttacking";
}): EffectBlock {
  return {
    category: "auto",
    effect: { count, player: "self", type: "draw" },
    id: toEffectId(`${String(cardId)}:${effectIdSuffix}`),
    sourcePresencePolicy: "mustRemainInSameZone",
    trigger: { type: triggerType },
  };
}

function parseSupportedSourceText(
  cardId: CardId,
  sourceText: string,
): CertifiedClause | undefined {
  return (
    parseOnPlayDrawClause(cardId, sourceText) ??
    parseWhenAttackingDrawClause(cardId, sourceText)
  );
}

function parseSupportedComposition(
  cardId: CardId,
  sourceText: string,
): readonly CertifiedClause[] | undefined {
  const lines = sourceText.split("\n");
  if (lines.length !== 2) {
    return undefined;
  }

  const onPlayClause = parseOnPlayDrawClause(cardId, lines[0] ?? "");
  const whenAttackingClause = parseWhenAttackingDrawClause(
    cardId,
    lines[1] ?? "",
  );
  if (onPlayClause === undefined || whenAttackingClause === undefined) {
    return undefined;
  }

  return [onPlayClause, whenAttackingClause];
}

function parseOnPlayDrawClause(
  cardId: CardId,
  sourceText: string,
): CertifiedClause | undefined {
  const count = parseDrawCount(sourceText, "[On Play] ");
  if (count === undefined) {
    return undefined;
  }

  return createOnPlayDrawClauseWithCount(cardId, count);
}

function parseWhenAttackingDrawClause(
  cardId: CardId,
  sourceText: string,
): CertifiedClause | undefined {
  const count = parseDrawCount(sourceText, "[When Attacking] ");
  if (count === undefined) {
    return undefined;
  }

  return createWhenAttackingDrawClauseWithCount(cardId, count);
}

function parseOnPlayDrawResidueClause(
  cardId: CardId,
  sourceText: string,
): ParsedResidueClause | undefined {
  const parsed = parseDrawCountWithResidue(sourceText, "[On Play] ");
  if (parsed === undefined) {
    return undefined;
  }

  return {
    clause: createOnPlayDrawClauseWithCount(cardId, parsed.count),
    prefix: parsed.prefix,
  };
}

function parseWhenAttackingDrawResidueClause(
  cardId: CardId,
  sourceText: string,
): ParsedResidueClause | undefined {
  const parsed = parseDrawCountWithResidue(sourceText, "[When Attacking] ");
  if (parsed === undefined) {
    return undefined;
  }

  return {
    clause: createWhenAttackingDrawClauseWithCount(cardId, parsed.count),
    prefix: parsed.prefix,
  };
}

function parseDrawCount(
  sourceText: string,
  prefix: "[On Play] " | "[When Attacking] ",
): number | undefined {
  const match = sourceText.match(
    /^\[(On Play|When Attacking)\] Draw (\d+) (card|cards)\.$/,
  );
  if (match === null) {
    return undefined;
  }

  const triggerText = match[1];
  const expectedPrefix =
    triggerText === "On Play"
      ? "[On Play] "
      : triggerText === "When Attacking"
        ? "[When Attacking] "
        : undefined;
  if (expectedPrefix === undefined) {
    return undefined;
  }

  if (expectedPrefix !== prefix) {
    return undefined;
  }

  const count = Number.parseInt(match[2] ?? "", 10);
  if (!Number.isSafeInteger(count) || count <= 0) {
    return undefined;
  }

  const noun = match[3];
  if ((count === 1 && noun !== "card") || (count !== 1 && noun !== "cards")) {
    return undefined;
  }

  return count;
}

function parseDrawCountWithResidue(
  sourceText: string,
  prefix: "[On Play] " | "[When Attacking] ",
): { count: number; prefix: string } | undefined {
  const match = sourceText.match(
    /^\[(On Play|When Attacking)\] Draw (\d+) (card|cards)\. /,
  );
  if (match === null) {
    return undefined;
  }

  const clausePrefix = match[0];
  const count = parseDrawCount(clausePrefix.slice(0, -1), prefix);
  if (count === undefined) {
    return undefined;
  }

  return { count, prefix: clausePrefix };
}

function getCompleteParserRuleIds(
  clauses: readonly CertifiedClause[],
): readonly string[] {
  const ruleIds = clauses.map((clause) => clause.parserRuleId);

  if (clauses.length > 1) {
    return [...ruleIds, lineSeparatedEffectBlocksCompositionId];
  }

  return ruleIds;
}

function toEffectId(value: string): EffectId {
  return value as EffectId;
}

function residueSpan({
  offset,
  prefix,
  source,
}: {
  offset: number;
  prefix: string;
  source: string;
}): GeneratedSupportUnparsedSpan {
  const start = offset + prefix.length;
  return {
    end: offset + source.length,
    start,
    text: source.slice(prefix.length),
  };
}
