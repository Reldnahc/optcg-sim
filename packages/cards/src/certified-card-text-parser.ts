import type { CardId, EffectBlock, EffectId } from "@optcg/types";

import type {
  GeneratedSupportParserResult,
  GeneratedSupportUnparsedSpan,
} from "./generated-support-types.js";

export const onPlayDrawOneParserRuleId = "exact:on-play:draw-1:self";
export const whenAttackingDrawOneParserRuleId =
  "exact:when-attacking:draw-1:self";
export const lineSeparatedEffectBlocksCompositionId =
  "line-separated-effect-blocks:v1";

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

export function parseCertifiedCardText(
  input: CertifiedCardTextParserInput,
): GeneratedSupportParserResult {
  if (input.sourceText === "[On Play] Draw 1 card.") {
    return completeParse(input, [createOnPlayDrawClause(input.cardId)]);
  }

  if (
    input.sourceText === "[On Play] Draw 1 card.\n[When Attacking] Draw 1 card."
  ) {
    return completeParse(input, [
      createOnPlayDrawClause(input.cardId),
      createWhenAttackingDrawClause(input.cardId),
    ]);
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
  if (line === "[On Play] Draw 1 card.") {
    return {
      clause: createOnPlayDrawClause(cardId),
    };
  }

  if (line === "[When Attacking] Draw 1 card.") {
    return {
      clause: createWhenAttackingDrawClause(cardId),
    };
  }

  if (line.startsWith("[On Play] Draw 1 card. ")) {
    return {
      clause: createOnPlayDrawClause(cardId),
      unparsedSpan: residueSpan({
        offset,
        prefix: "[On Play] Draw 1 card. ",
        source: line,
      }),
    };
  }

  if (line.startsWith("[When Attacking] Draw 1 card. ")) {
    return {
      clause: createWhenAttackingDrawClause(cardId),
      unparsedSpan: residueSpan({
        offset,
        prefix: "[When Attacking] Draw 1 card. ",
        source: line,
      }),
    };
  }

  return {};
}

function createOnPlayDrawClause(cardId: CardId): CertifiedClause {
  return {
    effectBlock: createDrawEffectBlock({
      cardId,
      effectIdSuffix: "auto-on-play-draw-1",
      triggerType: "onPlay",
    }),
    parserRuleId: onPlayDrawOneParserRuleId,
  };
}

function createWhenAttackingDrawClause(cardId: CardId): CertifiedClause {
  return {
    effectBlock: createDrawEffectBlock({
      cardId,
      effectIdSuffix: "auto-when-attacking-draw-1",
      triggerType: "whenAttacking",
    }),
    parserRuleId: whenAttackingDrawOneParserRuleId,
  };
}

function createDrawEffectBlock({
  cardId,
  effectIdSuffix,
  triggerType,
}: {
  cardId: CardId;
  effectIdSuffix: string;
  triggerType: "onPlay" | "whenAttacking";
}): EffectBlock {
  return {
    category: "auto",
    effect: { count: 1, player: "self", type: "draw" },
    id: toEffectId(`${String(cardId)}:${effectIdSuffix}`),
    sourcePresencePolicy: "mustRemainInSameZone",
    trigger: { type: triggerType },
  };
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
