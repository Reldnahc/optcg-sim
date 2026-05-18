import type {
  CardId,
  Effect,
  EffectBlock,
  SelectedTargetsRequest,
  Target,
} from "@optcg/types";

import {
  parseCard014gClause,
  parseCard014gResidueClause,
} from "./card014g-composed-parser.js";
import {
  buildCompleteParseResult,
  buildPartialParseResult,
  buildResidueSpan,
  buildSequenceEffect,
  buildUnsupportedWholeTextParseResult,
  findReusableComposedResiduePrefix,
  parseContinuousModifierInstructionBody,
  parseContinuousRestrictionInstructionBody,
  parseDrawInstructionBody,
  parseDrawThenTrashInstructionBody,
  parseOncePerTurnWrapper,
  parseReusableCard016ABaseClause,
  parseSelectOpponentCharacterInstructionBody,
  parseSelectOpponentCharacterThenKoInstructionBody,
  parseSupportedTriggerWrapper,
  toEffectId,
} from "./composed-parser-builder.js";
import type {
  GeneratedSupportParserResult,
  GeneratedSupportUnparsedSpan,
} from "./generated-support-types.js";

export const onPlayDrawNParserRuleId = "exact:on-play:draw-n:self";
export const whenAttackingDrawNParserRuleId =
  "exact:when-attacking:draw-n:self";
export const lineSeparatedEffectBlocksCompositionId =
  "line-separated-effect-blocks:v1";
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

type TriggerPrefix = "[On Play] " | "[When Attacking] ";
type DrawTrashPrefix = TriggerPrefix | "[When Attacking] [Once Per Turn] ";
type DrawThenTrashClauseOptions = Readonly<{
  cardId: CardId;
  effectIdPrefix: string;
  parserRuleId: string;
  prefix: DrawTrashPrefix;
  sourceText: string;
  trigger: { oncePerTurn?: true; type: "onPlay" | "whenAttacking" };
}>;

export function parseCertifiedCardText(
  input: CertifiedCardTextParserInput,
): GeneratedSupportParserResult {
  const singleLineParse =
    parseCardLineEffectClause(input.cardId, input.sourceText) ??
    parseStandaloneBlockerClause(input.sourceText) ??
    parseStandaloneEngineKeywordClause(input.sourceText);
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

  return buildUnsupportedWholeTextParseResult({
    cardId: input.cardId,
    sourceText: input.sourceText,
    sourceTextHash: input.sourceTextHash,
  });
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

function parseCertifiedLine(
  cardId: CardId,
  line: string,
  offset: number,
): CertifiedLineParse {
  const clause = parseCardLineEffectClause(cardId, line);
  if (clause !== undefined) {
    return { clause };
  }

  const standaloneClause =
    parseStandaloneBlockerClause(line) ??
    parseStandaloneEngineKeywordClause(line);
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

function parseFirstCardLineResidueClause(
  cardId: CardId,
  line: string,
): ParsedResidueClause | undefined {
  return (
    parseReusableCard016AResidueClause(cardId, line) ??
    parseCard014gResidueClause(cardId, line) ??
    parseCountedResidueClause({
      cardId,
      createClause: createOnPlayDrawClauseWithCount,
      parseCount: parseDrawCountWithResidue,
      prefix: "[On Play] ",
      sourceText: line,
    }) ??
    parseCountedResidueClause({
      cardId,
      createClause: createOnPlayDrawUpToClauseWithCount,
      parseCount: parseDrawUpToCountWithResidue,
      prefix: "[On Play] ",
      sourceText: line,
    }) ??
    parseDrawThenTrashResidueClauseWithPrefix({
      cardId,
      effectIdPrefix: "auto-on-play",
      parserRuleId: "exact:on-play:draw-n:trash-m:hand:self",
      prefix: "[On Play] ",
      sourceText: line,
      trigger: { type: "onPlay" },
    }) ??
    parseCountedResidueClause({
      cardId,
      createClause: createWhenAttackingDrawClauseWithCount,
      parseCount: parseDrawCountWithResidue,
      prefix: "[When Attacking] ",
      sourceText: line,
    }) ??
    parseDrawThenTrashResidueClauseWithPrefix({
      cardId,
      effectIdPrefix: "auto-when-attacking",
      parserRuleId: "exact:when-attacking:draw-n:trash-m:hand:self",
      prefix: "[When Attacking] ",
      sourceText: line,
      trigger: { type: "whenAttacking" },
    }) ??
    parseDrawThenTrashResidueClauseWithPrefix({
      cardId,
      effectIdPrefix: "auto-when-attacking-once-per-turn",
      parserRuleId:
        "exact:when-attacking:once-per-turn:draw-n:trash-m:hand:self",
      prefix: "[When Attacking] [Once Per Turn] ",
      sourceText: line,
      trigger: { oncePerTurn: true, type: "whenAttacking" },
    })
  );
}

function parseFirstStandaloneResidueClause(
  line: string,
): ParsedResidueClause | undefined {
  return (
    parseStandaloneBlockerResidueClause(line) ??
    parseStandaloneEngineKeywordResidueClause(line)
  );
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
    parserRuleId: "exact:on-play:draw-n:self",
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
    parserRuleId: "exact:on-play:draw-up-to-n:self",
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
    parserRuleId: "exact:when-attacking:draw-n:self",
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

function parseCardLineEffectClause(
  cardId: CardId,
  sourceText: string,
): CertifiedClause | undefined {
  return (
    parseReusableCard016AClause(cardId, sourceText) ??
    parseCard014gClause(cardId, sourceText) ??
    parseOnPlayDrawClause(cardId, sourceText) ??
    parseOnPlayDrawUpToClause(cardId, sourceText) ??
    parseOnPlayDrawThenTrashClause(cardId, sourceText) ??
    parseWhenAttackingDrawClause(cardId, sourceText) ??
    parseWhenAttackingDrawThenTrashClause(cardId, sourceText) ??
    parseWhenAttackingOncePerTurnDrawThenTrashClause(cardId, sourceText)
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

function parseReusableCard016AClause(
  cardId: CardId,
  sourceText: string,
): CertifiedClause | undefined {
  return (
    parseReusableCard016ABaseClause(cardId, sourceText) ??
    parseCard016ASelectTargetsClause(cardId, sourceText) ??
    parseCard016AContinuousClause(cardId, sourceText)
  );
}

function parseReusableCard016AResidueClause(
  cardId: CardId,
  sourceText: string,
): ParsedResidueClause | undefined {
  return findReusableComposedResiduePrefix(sourceText, (prefix) =>
    parseReusableCard016AClause(cardId, prefix),
  );
}

function parseCard016ASelectTargetsClause(
  cardId: CardId,
  sourceText: string,
): CertifiedClause | undefined {
  const wrapper = parseSupportedTriggerWrapper(sourceText);
  if (wrapper === undefined || wrapper.prefix !== "[On Play] ") {
    return undefined;
  }

  const selectOpponentCharacter = parseSelectOpponentCharacterInstructionBody(
    wrapper.bodyText,
  );
  if (selectOpponentCharacter !== undefined) {
    return createCard016AAutoClause({
      cardId,
      effect: buildSequenceEffect([
        {
          connector: "always",
          effect: {
            request: opponentCharacterSelectedTargetsRequest(),
            type: "selectTargets",
          },
          id: "selectOpponentCharacter",
          saveResultAs: "selectedTarget",
        },
      ]),
      effectIdSuffix: "auto-on-play-select-1-opponent-character-target",
      parserRuleId: "exact:on-play:select-1-opponent-character-target",
    });
  }

  const selectOpponentCharacterThenKo =
    parseSelectOpponentCharacterThenKoInstructionBody(wrapper.bodyText);
  if (selectOpponentCharacterThenKo !== undefined) {
    return createCard016AAutoClause({
      cardId,
      effect: buildSequenceEffect([
        {
          connector: "always",
          effect: {
            request: opponentCharacterSelectedTargetsRequest(),
            type: "selectTargets",
          },
          id: "selectOpponentCharacter",
          saveResultAs: "selectedTarget",
        },
        {
          connector: "ifPreviousSucceeded",
          effect: {
            target: savedOpponentCharacterTarget(),
            type: "ko",
          },
          id: "koSelectedTarget",
        },
      ]),
      effectIdSuffix: "auto-on-play-select-1-opponent-character-then-ko",
      parserRuleId:
        "exact:on-play:select-1-opponent-character-then-ko-that-character",
    });
  }

  return undefined;
}

function parseCard016AContinuousClause(
  cardId: CardId,
  sourceText: string,
): CertifiedClause | undefined {
  const wrapper = parseSupportedTriggerWrapper(sourceText);
  if (wrapper === undefined || wrapper.prefix !== "[On Play] ") {
    return undefined;
  }

  const modifier = parseContinuousModifierInstructionBody(wrapper.bodyText);
  if (modifier !== undefined) {
    const target = toCard016ATarget(modifier.target);
    if (target === undefined) {
      return undefined;
    }

    const targetId = toCard016AParserTargetId(modifier.target);
    const durationId =
      modifier.duration === "thisBattle" ? "this-battle" : "this-turn";
    return createCard016AAutoClause({
      cardId,
      effect: {
        duration: { type: modifier.duration },
        target,
        type: "modifyPower",
        value: modifier.value,
      },
      effectIdSuffix: `exact:on-play:modify-power:${targetId}:${durationId}`,
      parserRuleId: `exact:on-play:modify-power:${targetId}:${durationId}`,
    });
  }

  const restriction = parseContinuousRestrictionInstructionBody(
    wrapper.bodyText,
  );
  if (restriction === undefined) {
    return undefined;
  }

  const target = toCard016ATarget(restriction.target);
  if (target === undefined) {
    return undefined;
  }

  const targetId = toCard016AParserTargetId(restriction.target);
  const restrictionId =
    restriction.restriction === "cannotAttack"
      ? "cannot-attack"
      : "cannot-block";

  return createCard016AAutoClause({
    cardId,
    effect: {
      duration: { type: "thisTurn" },
      target,
      type: restriction.restriction,
    },
    effectIdSuffix: `exact:on-play:${restrictionId}:${targetId}:this-turn`,
    parserRuleId: `exact:on-play:${restrictionId}:${targetId}:this-turn`,
  });
}

function createCard016AAutoClause({
  cardId,
  effect,
  effectIdSuffix,
  parserRuleId,
}: {
  cardId: CardId;
  effect: Effect;
  effectIdSuffix: string;
  parserRuleId: string;
}): CertifiedClause {
  return {
    effectBlock: {
      category: "auto",
      effect,
      id: toEffectId(`${String(cardId)}:${effectIdSuffix}`),
      sourcePresencePolicy: "mustRemainInSameZone",
      trigger: { type: "onPlay" },
    },
    parserRuleId,
  };
}

function toCard016ATarget(
  target: "opponentCharactersAll" | "opponentCharactersChoose" | "self",
): Target | undefined {
  switch (target) {
    case "opponentCharactersAll":
      return {
        filter: { categories: ["character"] },
        player: "opponent",
        type: "all",
        zone: "characterArea",
      };
    case "opponentCharactersChoose":
      return {
        request: opponentCharacterChooseTargetRequest(),
        type: "choose",
      };
    case "self":
      return { type: "self" };
  }
}

function toCard016AParserTargetId(
  target: "opponentCharactersAll" | "opponentCharactersChoose" | "self",
): "all" | "choose" | "self" {
  switch (target) {
    case "opponentCharactersAll":
      return "all";
    case "opponentCharactersChoose":
      return "choose";
    case "self":
      return "self";
  }
}

function opponentCharacterSelectedTargetsRequest(): SelectedTargetsRequest {
  return {
    allowFewerIfUnavailable: false,
    chooser: "self",
    max: 1,
    min: 1,
    player: "opponent",
    timing: "onResolution",
    visibility: "public",
    zone: "characterArea",
  };
}

function opponentCharacterChooseTargetRequest(): SelectedTargetsRequest {
  return {
    allowFewerIfUnavailable: true,
    chooser: "self",
    filter: { categories: ["character"] },
    max: 1,
    min: 0,
    player: "opponent",
    timing: "onResolution",
    visibility: "public",
    zone: "characterArea",
  };
}

function savedOpponentCharacterTarget(): Extract<
  Target,
  { type: "savedFieldObject" }
> {
  return {
    binding: {
      family: "selectedTargets",
      objectIndex: 0,
      saveResultAs: "selectedTarget",
      sourceSegmentId: "selectOpponentCharacter",
    },
    onFailure: "failClosed",
    player: "opponent",
    type: "savedFieldObject",
    visibility: "publicOnly",
    zone: "characterArea",
  };
}

function parseOnPlayDrawClause(
  cardId: CardId,
  sourceText: string,
): CertifiedClause | undefined {
  return parseCountedDrawClause({
    cardId,
    createClause: createOnPlayDrawClauseWithCount,
    parseCount: parseDrawCount,
    prefix: "[On Play] ",
    sourceText,
  });
}

function parseOnPlayDrawUpToClause(
  cardId: CardId,
  sourceText: string,
): CertifiedClause | undefined {
  return parseCountedDrawClause({
    cardId,
    createClause: createOnPlayDrawUpToClauseWithCount,
    parseCount: parseDrawUpToCount,
    prefix: "[On Play] ",
    sourceText,
  });
}

function parseWhenAttackingDrawClause(
  cardId: CardId,
  sourceText: string,
): CertifiedClause | undefined {
  return parseCountedDrawClause({
    cardId,
    createClause: createWhenAttackingDrawClauseWithCount,
    parseCount: parseDrawCount,
    prefix: "[When Attacking] ",
    sourceText,
  });
}

function parseOnPlayDrawThenTrashClause(
  cardId: CardId,
  sourceText: string,
): CertifiedClause | undefined {
  return parseDrawThenTrashClauseWithPrefix({
    cardId,
    effectIdPrefix: "auto-on-play",
    parserRuleId: "exact:on-play:draw-n:trash-m:hand:self",
    prefix: "[On Play] ",
    sourceText,
    trigger: { type: "onPlay" },
  });
}

function parseWhenAttackingDrawThenTrashClause(
  cardId: CardId,
  sourceText: string,
): CertifiedClause | undefined {
  return parseDrawThenTrashClauseWithPrefix({
    cardId,
    effectIdPrefix: "auto-when-attacking",
    parserRuleId: "exact:when-attacking:draw-n:trash-m:hand:self",
    prefix: "[When Attacking] ",
    sourceText,
    trigger: { type: "whenAttacking" },
  });
}

function parseWhenAttackingOncePerTurnDrawThenTrashClause(
  cardId: CardId,
  sourceText: string,
): CertifiedClause | undefined {
  return parseDrawThenTrashClauseWithPrefix({
    cardId,
    effectIdPrefix: "auto-when-attacking-once-per-turn",
    parserRuleId: "exact:when-attacking:once-per-turn:draw-n:trash-m:hand:self",
    prefix: "[When Attacking] [Once Per Turn] ",
    sourceText,
    trigger: { oncePerTurn: true, type: "whenAttacking" },
  });
}

function parseCountedDrawClause({
  cardId,
  createClause,
  parseCount,
  prefix,
  sourceText,
}: {
  cardId: CardId;
  createClause: (cardId: CardId, count: number) => CertifiedClause;
  parseCount: (sourceText: string, prefix: TriggerPrefix) => number | undefined;
  prefix: TriggerPrefix;
  sourceText: string;
}): CertifiedClause | undefined {
  const count = parseCount(sourceText, prefix);
  return count === undefined ? undefined : createClause(cardId, count);
}

function parseDrawThenTrashClauseWithPrefix({
  cardId,
  effectIdPrefix,
  parserRuleId,
  prefix,
  sourceText,
  trigger,
}: DrawThenTrashClauseOptions): CertifiedClause | undefined {
  const parsed = parseDrawThenTrashCounts(sourceText, prefix);
  if (parsed === undefined) {
    return undefined;
  }

  return createDrawThenTrashClauseWithCounts({
    cardId,
    drawCount: parsed.drawCount,
    effectIdSuffix: `${effectIdPrefix}-draw-${String(parsed.drawCount)}-then-trash-${String(parsed.trashCount)}`,
    parserRuleId,
    trashCount: parsed.trashCount,
    trigger,
  });
}

const blockerReminderText =
  "(After your opponent declares an attack, you may rest this card to make it the new target of the attack.)";
const standaloneBlockerSourceText = "[Blocker]";
const standaloneBlockerWithReminderSourceText = `${standaloneBlockerSourceText} ${blockerReminderText}`;
const standaloneEngineKeywordDefinitions = [
  [
    "exact:keyword:rush:standalone",
    "[Rush]",
    "(This card can attack on the turn in which it is played.)",
  ],
  [
    "exact:keyword:rush-character:standalone",
    "[Rush: Character]",
    "(This card can attack Characters on the turn in which it is played.)",
  ],
  [
    "exact:keyword:double-attack:standalone",
    "[Double Attack]",
    "(This card deals 2 damage.)",
  ],
  [
    "exact:keyword:banish:standalone",
    "[Banish]",
    "(When this card deals damage, the target card is trashed without activating its Trigger.)",
  ],
] as const;

function parseStandaloneBlockerClause(sourceText: string) {
  return sourceText === standaloneBlockerSourceText ||
    sourceText === standaloneBlockerWithReminderSourceText
    ? createStandaloneKeywordClause("exact:keyword:blocker:standalone")
    : undefined;
}

function createStandaloneKeywordClause(parserRuleId: string): CertifiedClause {
  return { implementationStatus: "vanilla-confirmed", parserRuleId };
}

function parseStandaloneEngineKeywordClause(sourceText: string) {
  const definition = standaloneEngineKeywordDefinitions.find(
    (candidate) =>
      sourceText === candidate[1] ||
      sourceText === `${candidate[1]} ${candidate[2]}`,
  );

  return definition === undefined
    ? undefined
    : createStandaloneKeywordClause(definition[0]);
}

function parseCountedResidueClause({
  cardId,
  createClause,
  parseCount,
  prefix,
  sourceText,
}: {
  cardId: CardId;
  createClause: (cardId: CardId, count: number) => CertifiedClause;
  parseCount: (
    sourceText: string,
    prefix: TriggerPrefix,
  ) => { count: number; prefix: string } | undefined;
  prefix: TriggerPrefix;
  sourceText: string;
}): ParsedResidueClause | undefined {
  const parsed = parseCount(sourceText, prefix);
  return parsed === undefined
    ? undefined
    : { clause: createClause(cardId, parsed.count), prefix: parsed.prefix };
}

function parseDrawThenTrashResidueClauseWithPrefix({
  cardId,
  effectIdPrefix,
  parserRuleId,
  prefix,
  sourceText,
  trigger,
}: DrawThenTrashClauseOptions): ParsedResidueClause | undefined {
  const parsed = parseDrawThenTrashCountsWithResidue(sourceText, prefix);
  if (parsed === undefined) {
    return undefined;
  }

  return {
    clause: createDrawThenTrashClauseWithCounts({
      cardId,
      drawCount: parsed.drawCount,
      effectIdSuffix: `${effectIdPrefix}-draw-${String(parsed.drawCount)}-then-trash-${String(parsed.trashCount)}`,
      parserRuleId,
      trashCount: parsed.trashCount,
      trigger,
    }),
    prefix: parsed.prefix,
  };
}

function parseStandaloneBlockerResidueClause(sourceText: string) {
  const reminderPrefix = `${standaloneBlockerWithReminderSourceText} `;
  const sourcePrefix = `${standaloneBlockerSourceText} `;
  const prefix = sourceText.startsWith(reminderPrefix)
    ? reminderPrefix
    : sourceText.startsWith(sourcePrefix)
      ? sourcePrefix
      : undefined;
  if (prefix === undefined) {
    return undefined;
  }

  return {
    clause: createStandaloneKeywordClause("exact:keyword:blocker:standalone"),
    prefix,
  };
}

function parseStandaloneEngineKeywordResidueClause(sourceText: string) {
  for (const definition of standaloneEngineKeywordDefinitions) {
    const sourcePrefix = `${definition[1]} `;
    const reminderPrefix = `${definition[1]} ${definition[2]} `;
    const prefix = sourceText.startsWith(reminderPrefix)
      ? reminderPrefix
      : sourceText.startsWith(sourcePrefix)
        ? sourcePrefix
        : undefined;

    if (prefix !== undefined) {
      return {
        clause: createStandaloneKeywordClause(definition[0]),
        prefix,
      };
    }
  }

  return undefined;
}

function parseDrawCount(sourceText: string, prefix: TriggerPrefix) {
  const parsed = parseTriggeredDrawInstruction(sourceText, prefix);
  return parsed?.mode === "exact" ? parsed.count : undefined;
}

function parseDrawUpToCount(sourceText: string, prefix: TriggerPrefix) {
  const parsed = parseTriggeredDrawInstruction(sourceText, prefix);
  return parsed?.mode === "upTo" ? parsed.count : undefined;
}

function parseTriggeredDrawInstruction(
  sourceText: string,
  prefix: TriggerPrefix,
) {
  const wrapper = parseSupportedTriggerWrapper(sourceText);
  if (wrapper === undefined || wrapper.prefix !== prefix) {
    return undefined;
  }

  return parseDrawInstructionBody(wrapper.bodyText);
}

function parseDrawCountWithResidue(sourceText: string, prefix: TriggerPrefix) {
  return parseDrawInstructionCountWithResidue(
    sourceText,
    prefix,
    /^Draw (\d+) (card|cards)\. /,
    parseDrawCount,
  );
}

function parseDrawUpToCountWithResidue(
  sourceText: string,
  prefix: TriggerPrefix,
) {
  return parseDrawInstructionCountWithResidue(
    sourceText,
    prefix,
    /^Draw up to (\d+) (card|cards)\. /,
    parseDrawUpToCount,
  );
}

function parseDrawInstructionCountWithResidue(
  sourceText: string,
  prefix: TriggerPrefix,
  pattern: RegExp,
  parseExactClause: (
    clauseText: string,
    prefix: TriggerPrefix,
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

function parseDrawThenTrashCounts(sourceText: string, prefix: DrawTrashPrefix) {
  const wrapper = parseDrawThenTrashWrapper(sourceText, prefix);
  if (wrapper === undefined) {
    return undefined;
  }

  return parseDrawThenTrashInstructionBody(wrapper.bodyText);
}

function parseDrawThenTrashCountsWithResidue(
  sourceText: string,
  prefix: DrawTrashPrefix,
) {
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
  prefix: DrawTrashPrefix,
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

function getCompleteParserRuleIds(clauses: readonly CertifiedClause[]) {
  const ruleIds = clauses.map((clause) => clause.parserRuleId);
  return clauses.length > 1
    ? [...ruleIds, "line-separated-effect-blocks:v1"]
    : ruleIds;
}

function resolveImplementationStatus(clauses: readonly CertifiedClause[]) {
  return clauses.length > 0 &&
    clauses.every(
      (clause) => clause.implementationStatus === "vanilla-confirmed",
    )
    ? "vanilla-confirmed"
    : "implemented-dsl";
}
