import type { CardId, EffectBlock, EffectId } from "@optcg/types";

import {
  buildCompleteParseResult,
  buildPartialParseResult,
  buildResidueSpan,
  buildSequenceEffect,
  buildUnsupportedWholeTextParseResult,
  createDeterministicParserRuleId,
  parseExactPositiveSafeInteger,
  parseOncePerTurnWrapper,
  parseSupportedTriggerWrapper,
} from "./composed-parser-builder.js";
import type {
  GeneratedSupportParserResult,
  GeneratedSupportUnparsedSpan,
} from "./generated-support-types.js";

export const onPlayDrawNParserRuleId = createDeterministicParserRuleId([
  "exact",
  "on-play",
  "draw-n",
  "self",
]);
export const onPlayDrawUpToNParserRuleId = createDeterministicParserRuleId([
  "exact",
  "on-play",
  "draw-up-to-n",
  "self",
]);
export const whenAttackingDrawNParserRuleId = createDeterministicParserRuleId([
  "exact",
  "when-attacking",
  "draw-n",
  "self",
]);
export const onPlayDrawNTrashMFromHandParserRuleId =
  createDeterministicParserRuleId([
    "exact",
    "on-play",
    "draw-n",
    "trash-m",
    "hand",
    "self",
  ]);
export const whenAttackingDrawNTrashMFromHandParserRuleId =
  createDeterministicParserRuleId([
    "exact",
    "when-attacking",
    "draw-n",
    "trash-m",
    "hand",
    "self",
  ]);
export const whenAttackingOncePerTurnDrawNTrashMFromHandParserRuleId =
  createDeterministicParserRuleId([
    "exact",
    "when-attacking",
    "once-per-turn",
    "draw-n",
    "trash-m",
    "hand",
    "self",
  ]);
export const onPlayTrash2FromHandDraw1ParserRuleId =
  createDeterministicParserRuleId([
    "exact",
    "on-play",
    "trash-2-from-hand",
    "draw-1",
    "self",
  ]);
export const standaloneBlockerKeywordParserRuleId =
  createDeterministicParserRuleId([
    "exact",
    "keyword",
    "blocker",
    "standalone",
  ]);
export const standaloneRushKeywordParserRuleId =
  createDeterministicParserRuleId(["exact", "keyword", "rush", "standalone"]);
export const standaloneRushCharacterKeywordParserRuleId =
  createDeterministicParserRuleId([
    "exact",
    "keyword",
    "rush-character",
    "standalone",
  ]);
export const standaloneDoubleAttackKeywordParserRuleId =
  createDeterministicParserRuleId([
    "exact",
    "keyword",
    "double-attack",
    "standalone",
  ]);
export const standaloneBanishKeywordParserRuleId =
  createDeterministicParserRuleId(["exact", "keyword", "banish", "standalone"]);
export const lineSeparatedEffectBlocksCompositionId =
  createDeterministicParserRuleId(["line-separated-effect-blocks", "v1"]);
export const certifiedParserRuleReviewer = "certified-parser-rule:CARD-009B";

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
  readonly effectBlock?: EffectBlock;
  readonly implementationStatus?: "implemented-dsl" | "vanilla-confirmed";
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
    return buildPartialParseResult({
      cardId: input.cardId,
      message: "Card text is not covered by certified parser rules.",
      parsedRuleIds: [],
      sourceText: input.sourceText,
      sourceTextHash: input.sourceTextHash,
      unparsedSpans,
    });
  }

  if (unparsedSpans.length > 0) {
    return buildPartialParseResult({
      cardId: input.cardId,
      message: "Unsupported card text remains after certified parsing.",
      parsedRuleIds: parsedClauses.map((clause) => clause.parserRuleId),
      sourceText: input.sourceText,
      sourceTextHash: input.sourceTextHash,
      unparsedSpans,
    });
  }

  return unsupportedWholeText(input);
}

function completeParse(
  input: CertifiedCardTextParserInput,
  parsedClauses: readonly CertifiedClause[],
): GeneratedSupportParserResult {
  return buildCompleteParseResult({
    cardId: input.cardId,
    effectDefinition: {
      cardId: input.cardId,
      effects: parsedClauses.flatMap((clause) =>
        clause.effectBlock === undefined ? [] : [clause.effectBlock],
      ),
      implementationStatus: resolveImplementationStatus(parsedClauses),
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
  });
}

function unsupportedWholeText(
  input: CertifiedCardTextParserInput,
): GeneratedSupportParserResult {
  return buildUnsupportedWholeTextParseResult({
    cardId: input.cardId,
    sourceText: input.sourceText,
    sourceTextHash: input.sourceTextHash,
  });
}

function parseCertifiedLine(
  cardId: CardId,
  line: string,
  offset: number,
): CertifiedLineParse {
  const clause = parseFirstCardLineClause(cardId, line);
  if (clause !== undefined) {
    return { clause };
  }

  const standaloneClause = parseFirstStandaloneClause(line);
  if (standaloneClause !== undefined) {
    return { clause: standaloneClause };
  }

  const residue =
    parseFirstCardLineResidueClause(cardId, line) ??
    parseFirstStandaloneResidueClause(line);
  if (residue !== undefined) {
    return toResidueLineParse(residue, line, offset);
  }

  return {};
}

function parseFirstCardLineClause(
  cardId: CardId,
  line: string,
): CertifiedClause | undefined {
  const parsers = [
    parseOnPlayDrawClause,
    parseOnPlayDrawUpToClause,
    parseOnPlayDrawThenTrashClause,
    parseOnPlayTrashThenDrawClause,
    parseWhenAttackingDrawClause,
    parseWhenAttackingDrawThenTrashClause,
    parseWhenAttackingOncePerTurnDrawThenTrashClause,
  ] as const;

  for (const parseClause of parsers) {
    const clause = parseClause(cardId, line);
    if (clause !== undefined) {
      return clause;
    }
  }

  return undefined;
}

function parseFirstStandaloneClause(line: string): CertifiedClause | undefined {
  const parsers = [
    parseStandaloneBlockerClause,
    parseStandaloneEngineKeywordClause,
  ] as const;

  for (const parseClause of parsers) {
    const clause = parseClause(line);
    if (clause !== undefined) {
      return clause;
    }
  }

  return undefined;
}

function parseFirstCardLineResidueClause(
  cardId: CardId,
  line: string,
): ParsedResidueClause | undefined {
  const parsers = [
    parseOnPlayDrawResidueClause,
    parseOnPlayDrawUpToResidueClause,
    parseOnPlayDrawThenTrashResidueClause,
    parseWhenAttackingDrawResidueClause,
    parseWhenAttackingDrawThenTrashResidueClause,
    parseWhenAttackingOncePerTurnDrawThenTrashResidueClause,
  ] as const;

  for (const parseResidue of parsers) {
    const residue = parseResidue(cardId, line);
    if (residue !== undefined) {
      return residue;
    }
  }

  return undefined;
}

function parseFirstStandaloneResidueClause(
  line: string,
): ParsedResidueClause | undefined {
  const parsers = [
    parseStandaloneBlockerResidueClause,
    parseStandaloneEngineKeywordResidueClause,
  ] as const;

  for (const parseResidue of parsers) {
    const residue = parseResidue(line);
    if (residue !== undefined) {
      return residue;
    }
  }

  return undefined;
}

function toResidueLineParse(
  residue: ParsedResidueClause,
  line: string,
  offset: number,
): CertifiedLineParse {
  return {
    clause: residue.clause,
    unparsedSpan: buildResidueSpan({
      offset,
      prefix: residue.prefix,
      source: line,
    }),
  };
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

function createOnPlayDrawUpToClauseWithCount(
  cardId: CardId,
  count: number,
): CertifiedClause {
  return {
    effectBlock: createDrawEffectBlock({
      cardId,
      count,
      effectIdSuffix: `auto-on-play-draw-up-to-${String(count)}`,
      effectType: "drawUpTo",
      triggerType: "onPlay",
    }),
    parserRuleId: onPlayDrawUpToNParserRuleId,
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

function createStandaloneBlockerClause(): CertifiedClause {
  return createStandaloneKeywordClause(standaloneBlockerKeywordParserRuleId);
}

function createStandaloneKeywordClause(parserRuleId: string): CertifiedClause {
  return {
    implementationStatus: "vanilla-confirmed",
    parserRuleId,
  };
}

function createDrawEffectBlock({
  cardId,
  count,
  effectIdSuffix,
  effectType = "draw",
  triggerType,
}: {
  cardId: CardId;
  count: number;
  effectIdSuffix: string;
  effectType?: "draw" | "drawUpTo";
  triggerType: "onPlay" | "whenAttacking";
}): EffectBlock {
  return {
    category: "auto",
    effect: { count, player: "self", type: effectType },
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
    parseOnPlayDrawUpToClause(cardId, sourceText) ??
    parseWhenAttackingDrawClause(cardId, sourceText) ??
    parseOnPlayDrawThenTrashClause(cardId, sourceText) ??
    parseOnPlayTrashThenDrawClause(cardId, sourceText) ??
    parseWhenAttackingDrawThenTrashClause(cardId, sourceText) ??
    parseWhenAttackingOncePerTurnDrawThenTrashClause(cardId, sourceText) ??
    parseStandaloneBlockerClause(sourceText) ??
    parseStandaloneEngineKeywordClause(sourceText)
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

function parseOnPlayDrawUpToClause(
  cardId: CardId,
  sourceText: string,
): CertifiedClause | undefined {
  const count = parseDrawUpToCount(sourceText, "[On Play] ");
  if (count === undefined) {
    return undefined;
  }

  return createOnPlayDrawUpToClauseWithCount(cardId, count);
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

function parseOnPlayDrawThenTrashClause(
  cardId: CardId,
  sourceText: string,
): CertifiedClause | undefined {
  const parsed = parseDrawThenTrashCounts(sourceText, "[On Play] ");
  if (parsed === undefined) {
    return undefined;
  }

  return createDrawThenTrashClauseWithCounts({
    cardId,
    drawCount: parsed.drawCount,
    effectIdSuffix: `auto-on-play-draw-${String(parsed.drawCount)}-then-trash-${String(parsed.trashCount)}`,
    parserRuleId: onPlayDrawNTrashMFromHandParserRuleId,
    trashCount: parsed.trashCount,
    trigger: { type: "onPlay" },
  });
}

function parseWhenAttackingDrawThenTrashClause(
  cardId: CardId,
  sourceText: string,
): CertifiedClause | undefined {
  const parsed = parseDrawThenTrashCounts(sourceText, "[When Attacking] ");
  if (parsed === undefined) {
    return undefined;
  }

  return createDrawThenTrashClauseWithCounts({
    cardId,
    drawCount: parsed.drawCount,
    effectIdSuffix: `auto-when-attacking-draw-${String(parsed.drawCount)}-then-trash-${String(parsed.trashCount)}`,
    parserRuleId: whenAttackingDrawNTrashMFromHandParserRuleId,
    trashCount: parsed.trashCount,
    trigger: { type: "whenAttacking" },
  });
}

function parseWhenAttackingOncePerTurnDrawThenTrashClause(
  cardId: CardId,
  sourceText: string,
): CertifiedClause | undefined {
  const parsed = parseDrawThenTrashCounts(
    sourceText,
    "[When Attacking] [Once Per Turn] ",
  );
  if (parsed === undefined) {
    return undefined;
  }

  return createDrawThenTrashClauseWithCounts({
    cardId,
    drawCount: parsed.drawCount,
    effectIdSuffix: `auto-when-attacking-once-per-turn-draw-${String(parsed.drawCount)}-then-trash-${String(parsed.trashCount)}`,
    parserRuleId: whenAttackingOncePerTurnDrawNTrashMFromHandParserRuleId,
    trashCount: parsed.trashCount,
    trigger: { oncePerTurn: true, type: "whenAttacking" },
  });
}

function parseOnPlayTrashThenDrawClause(
  cardId: CardId,
  sourceText: string,
): CertifiedClause | undefined {
  const wrapper = parseSupportedTriggerWrapper(sourceText);
  if (wrapper === undefined || wrapper.prefix !== "[On Play] ") {
    return undefined;
  }

  if (wrapper.bodyText !== "Trash 2 cards from your hand. Draw 1 card.") {
    return undefined;
  }

  return {
    effectBlock: {
      category: "auto",
      effect: buildSequenceEffect([
        {
          connector: "always",
          effect: {
            chooser: "self",
            count: 2,
            player: "self",
            type: "trashFromHand",
          },
        },
        {
          connector: "then",
          effect: { count: 1, player: "self", type: "draw" },
        },
      ]),
      id: toEffectId(`${String(cardId)}:auto-on-play-trash-2-then-draw-1`),
      sourcePresencePolicy: "mustRemainInSameZone",
      trigger: { type: "onPlay" },
    },
    parserRuleId: onPlayTrash2FromHandDraw1ParserRuleId,
  };
}

const blockerReminderText =
  "(After your opponent declares an attack, you may rest this card to make it the new target of the attack.)";
const standaloneBlockerSourceText = "[Blocker]";
const standaloneBlockerWithReminderSourceText = `${standaloneBlockerSourceText} ${blockerReminderText}`;
const standaloneEngineKeywordDefinitions = [
  {
    parserRuleId: standaloneRushKeywordParserRuleId,
    reminderText: "(This card can attack on the turn in which it is played.)",
    sourceText: "[Rush]",
  },
  {
    parserRuleId: standaloneRushCharacterKeywordParserRuleId,
    reminderText:
      "(This card can attack Characters on the turn in which it is played.)",
    sourceText: "[Rush: Character]",
  },
  {
    parserRuleId: standaloneDoubleAttackKeywordParserRuleId,
    reminderText: "(This card deals 2 damage.)",
    sourceText: "[Double Attack]",
  },
  {
    parserRuleId: standaloneBanishKeywordParserRuleId,
    reminderText:
      "(When this card deals damage, the target card is trashed without activating its Trigger.)",
    sourceText: "[Banish]",
  },
] as const;

function parseStandaloneBlockerClause(
  sourceText: string,
): CertifiedClause | undefined {
  if (
    sourceText === standaloneBlockerSourceText ||
    sourceText === standaloneBlockerWithReminderSourceText
  ) {
    return createStandaloneBlockerClause();
  }

  return undefined;
}

function parseStandaloneEngineKeywordClause(
  sourceText: string,
): CertifiedClause | undefined {
  const definition = standaloneEngineKeywordDefinitions.find(
    (candidate) =>
      sourceText === candidate.sourceText ||
      sourceText === `${candidate.sourceText} ${candidate.reminderText}`,
  );

  if (definition === undefined) {
    return undefined;
  }

  return createStandaloneKeywordClause(definition.parserRuleId);
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

function parseOnPlayDrawUpToResidueClause(
  cardId: CardId,
  sourceText: string,
): ParsedResidueClause | undefined {
  const parsed = parseDrawUpToCountWithResidue(sourceText, "[On Play] ");
  if (parsed === undefined) {
    return undefined;
  }

  return {
    clause: createOnPlayDrawUpToClauseWithCount(cardId, parsed.count),
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

function parseOnPlayDrawThenTrashResidueClause(
  cardId: CardId,
  sourceText: string,
): ParsedResidueClause | undefined {
  const parsed = parseDrawThenTrashCountsWithResidue(sourceText, "[On Play] ");
  if (parsed === undefined) {
    return undefined;
  }

  return {
    clause: createDrawThenTrashClauseWithCounts({
      cardId,
      drawCount: parsed.drawCount,
      effectIdSuffix: `auto-on-play-draw-${String(parsed.drawCount)}-then-trash-${String(parsed.trashCount)}`,
      parserRuleId: onPlayDrawNTrashMFromHandParserRuleId,
      trashCount: parsed.trashCount,
      trigger: { type: "onPlay" },
    }),
    prefix: parsed.prefix,
  };
}

function parseWhenAttackingDrawThenTrashResidueClause(
  cardId: CardId,
  sourceText: string,
): ParsedResidueClause | undefined {
  const parsed = parseDrawThenTrashCountsWithResidue(
    sourceText,
    "[When Attacking] ",
  );
  if (parsed === undefined) {
    return undefined;
  }

  return {
    clause: createDrawThenTrashClauseWithCounts({
      cardId,
      drawCount: parsed.drawCount,
      effectIdSuffix: `auto-when-attacking-draw-${String(parsed.drawCount)}-then-trash-${String(parsed.trashCount)}`,
      parserRuleId: whenAttackingDrawNTrashMFromHandParserRuleId,
      trashCount: parsed.trashCount,
      trigger: { type: "whenAttacking" },
    }),
    prefix: parsed.prefix,
  };
}

function parseWhenAttackingOncePerTurnDrawThenTrashResidueClause(
  cardId: CardId,
  sourceText: string,
): ParsedResidueClause | undefined {
  const parsed = parseDrawThenTrashCountsWithResidue(
    sourceText,
    "[When Attacking] [Once Per Turn] ",
  );
  if (parsed === undefined) {
    return undefined;
  }

  return {
    clause: createDrawThenTrashClauseWithCounts({
      cardId,
      drawCount: parsed.drawCount,
      effectIdSuffix: `auto-when-attacking-once-per-turn-draw-${String(parsed.drawCount)}-then-trash-${String(parsed.trashCount)}`,
      parserRuleId: whenAttackingOncePerTurnDrawNTrashMFromHandParserRuleId,
      trashCount: parsed.trashCount,
      trigger: { oncePerTurn: true, type: "whenAttacking" },
    }),
    prefix: parsed.prefix,
  };
}

function parseStandaloneBlockerResidueClause(
  sourceText: string,
): ParsedResidueClause | undefined {
  const reminderPrefix = `${standaloneBlockerWithReminderSourceText} `;
  if (sourceText.startsWith(reminderPrefix)) {
    return {
      clause: createStandaloneBlockerClause(),
      prefix: reminderPrefix,
    };
  }

  if (!sourceText.startsWith(`${standaloneBlockerSourceText} `)) {
    return undefined;
  }

  return {
    clause: createStandaloneBlockerClause(),
    prefix: `${standaloneBlockerSourceText} `,
  };
}

function parseStandaloneEngineKeywordResidueClause(
  sourceText: string,
): ParsedResidueClause | undefined {
  for (const definition of standaloneEngineKeywordDefinitions) {
    const sourcePrefix = `${definition.sourceText} `;
    const reminderPrefix = `${definition.sourceText} ${definition.reminderText} `;

    if (sourceText.startsWith(reminderPrefix)) {
      return {
        clause: createStandaloneKeywordClause(definition.parserRuleId),
        prefix: reminderPrefix,
      };
    }

    if (sourceText.startsWith(sourcePrefix)) {
      return {
        clause: createStandaloneKeywordClause(definition.parserRuleId),
        prefix: sourcePrefix,
      };
    }
  }

  return undefined;
}

function parseDrawCount(
  sourceText: string,
  prefix: "[On Play] " | "[When Attacking] ",
): number | undefined {
  return parseDrawInstructionCount(
    sourceText,
    prefix,
    /^Draw (\d+) (card|cards)\.$/,
  );
}

function parseDrawUpToCount(
  sourceText: string,
  prefix: "[On Play] " | "[When Attacking] ",
): number | undefined {
  return parseDrawInstructionCount(
    sourceText,
    prefix,
    /^Draw up to (\d+) (card|cards)\.$/,
  );
}

function parseDrawInstructionCount(
  sourceText: string,
  prefix: "[On Play] " | "[When Attacking] ",
  pattern: RegExp,
): number | undefined {
  const wrapper = parseSupportedTriggerWrapper(sourceText);
  if (wrapper === undefined || wrapper.prefix !== prefix) {
    return undefined;
  }

  const match = wrapper.bodyText.match(pattern);
  if (match === null) {
    return undefined;
  }

  return parsePositiveCardCount(match[1] ?? "", match[2]);
}

function parseDrawCountWithResidue(
  sourceText: string,
  prefix: "[On Play] " | "[When Attacking] ",
): { count: number; prefix: string } | undefined {
  return parseDrawInstructionCountWithResidue(
    sourceText,
    prefix,
    /^Draw (\d+) (card|cards)\. /,
    parseDrawCount,
  );
}

function parseDrawUpToCountWithResidue(
  sourceText: string,
  prefix: "[On Play] " | "[When Attacking] ",
): { count: number; prefix: string } | undefined {
  return parseDrawInstructionCountWithResidue(
    sourceText,
    prefix,
    /^Draw up to (\d+) (card|cards)\. /,
    parseDrawUpToCount,
  );
}

function parseDrawInstructionCountWithResidue(
  sourceText: string,
  prefix: "[On Play] " | "[When Attacking] ",
  pattern: RegExp,
  parseExactClause: (
    clauseText: string,
    prefix: "[On Play] " | "[When Attacking] ",
  ) => number | undefined,
): { count: number; prefix: string } | undefined {
  const wrapper = parseSupportedTriggerWrapper(sourceText);
  if (wrapper === undefined || wrapper.prefix !== prefix) {
    return undefined;
  }

  const match = wrapper.bodyText.match(pattern);
  if (match === null) {
    return undefined;
  }

  const clausePrefix = `${wrapper.prefix}${match[0]}`;
  const count = parseExactClause(clausePrefix.slice(0, -1), prefix);
  if (count === undefined) {
    return undefined;
  }

  return { count, prefix: clausePrefix };
}

function parseDrawThenTrashCounts(
  sourceText: string,
  prefix:
    | "[On Play] "
    | "[When Attacking] "
    | "[When Attacking] [Once Per Turn] ",
): { drawCount: number; trashCount: number } | undefined {
  const wrapper = parseDrawThenTrashWrapper(sourceText, prefix);
  if (wrapper === undefined) {
    return undefined;
  }

  const match = wrapper.bodyText.match(
    /^Draw (\d+) (card|cards) and trash (\d+) (card|cards) from your hand\.$/,
  );
  if (match === null) {
    return undefined;
  }

  const drawCountText = match[1] ?? "";
  const drawCount = parsePositiveCardCount(drawCountText, match[2]);
  if (drawCount === undefined) {
    return undefined;
  }

  const trashCountText = match[3] ?? "";
  const trashCount = parsePositiveCardCount(trashCountText, match[4]);
  if (trashCount === undefined) {
    return undefined;
  }

  return { drawCount, trashCount };
}

function parsePositiveCardCount(
  countText: string,
  noun: string | undefined,
): number | undefined {
  const count = parseExactPositiveSafeInteger(countText);
  if (count === undefined) {
    return undefined;
  }

  if ((count === 1 && noun !== "card") || (count !== 1 && noun !== "cards")) {
    return undefined;
  }

  return count;
}

function parseDrawThenTrashCountsWithResidue(
  sourceText: string,
  prefix:
    | "[On Play] "
    | "[When Attacking] "
    | "[When Attacking] [Once Per Turn] ",
): { drawCount: number; prefix: string; trashCount: number } | undefined {
  const wrapper = parseDrawThenTrashWrapper(sourceText, prefix);
  if (wrapper === undefined) {
    return undefined;
  }

  const match = wrapper.bodyText.match(
    /^Draw (\d+) (card|cards) and trash (\d+) (card|cards) from your hand\. /,
  );
  if (match === null) {
    return undefined;
  }

  const clausePrefix = `${wrapper.prefix}${match[0]}`;
  const parsed = parseDrawThenTrashCounts(clausePrefix.slice(0, -1), prefix);
  if (parsed === undefined) {
    return undefined;
  }

  return { ...parsed, prefix: clausePrefix };
}

function parseDrawThenTrashWrapper(
  sourceText: string,
  prefix:
    | "[On Play] "
    | "[When Attacking] "
    | "[When Attacking] [Once Per Turn] ",
): { bodyText: string; prefix: string } | undefined {
  const wrapper = parseSupportedTriggerWrapper(sourceText);
  if (wrapper === undefined) {
    return undefined;
  }

  if (prefix !== "[When Attacking] [Once Per Turn] ") {
    if (wrapper.prefix !== prefix) {
      return undefined;
    }

    return {
      bodyText: wrapper.bodyText,
      prefix: wrapper.prefix,
    };
  }

  if (wrapper.prefix !== "[When Attacking] ") {
    return undefined;
  }

  const oncePerTurn = parseOncePerTurnWrapper(wrapper.bodyText);
  if (oncePerTurn === undefined) {
    return undefined;
  }

  return {
    bodyText: oncePerTurn.bodyText,
    prefix: `${wrapper.prefix}${oncePerTurn.prefix}`,
  };
}

function createDrawThenTrashClauseWithCounts({
  cardId,
  drawCount,
  effectIdSuffix,
  parserRuleId,
  trashCount,
  trigger,
}: {
  cardId: CardId;
  drawCount: number;
  effectIdSuffix: string;
  parserRuleId: string;
  trashCount: number;
  trigger: { oncePerTurn?: true; type: "onPlay" | "whenAttacking" };
}): CertifiedClause {
  const oncePerTurnEffectBlockField =
    trigger.oncePerTurn === true ? { oncePerTurn: true } : {};

  return {
    effectBlock: {
      category: "auto",
      effect: buildSequenceEffect([
        {
          connector: "always",
          effect: { count: drawCount, player: "self", type: "draw" },
        },
        {
          connector: "then",
          effect: {
            chooser: "self",
            count: trashCount,
            player: "self",
            type: "trashFromHand",
          },
        },
      ]),
      id: toEffectId(`${String(cardId)}:${effectIdSuffix}`),
      ...oncePerTurnEffectBlockField,
      sourcePresencePolicy: "mustRemainInSameZone",
      trigger: { type: trigger.type },
    },
    parserRuleId,
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

function resolveImplementationStatus(
  clauses: readonly CertifiedClause[],
): "implemented-dsl" | "vanilla-confirmed" {
  if (
    clauses.length > 0 &&
    clauses.every(
      (clause) => clause.implementationStatus === "vanilla-confirmed",
    )
  ) {
    return "vanilla-confirmed";
  }

  return "implemented-dsl";
}

function toEffectId(value: string): EffectId {
  return value as EffectId;
}
