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
  parseDrawThenTrashInstructionBody,
  parseOncePerTurnWrapper,
  parseReusableCard016ABaseClause,
  parseSelectOpponentCharacterInstructionBody,
  parseSelectOpponentCharacterThenKoInstructionBody,
  parseSupportedTriggerWrapper,
  parseTriggeredDrawClause,
  toEffectId,
  type TriggeredDrawClauseOptions,
} from "./composed-parser-builder.js";
import {
  buildConditionalContinuousCompositionClauseFromSource,
  conditionalContinuousTrashCountParserRuleId,
  parseConditionalWrapper,
} from "./conditional-generated-support-composer.js";
import { parseOnPlayReturnDonDrawClause } from "./don-minus-draw-components.js";
import type {
  GeneratedSupportParserResult,
  GeneratedSupportUnparsedSpan,
} from "./generated-support-types.js";
import {
  getClauseParserRuleIds,
  getCompleteParserRuleIds,
} from "./parser-rule-id-components.js";
import { parseReturnDonCostWrapperResidueClause } from "./return-don-cost-wrapper-components.js";
import {
  parseStandaloneBlockerClause,
  parseStandaloneBlockerResidueClause,
  parseStandaloneEngineKeywordClause,
  parseStandaloneEngineKeywordResidueClause,
} from "./standalone-keyword-parser.js";

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
  readonly parserRuleIds?: readonly string[];
}

interface ParsedResidueClause {
  readonly clause: CertifiedClause;
  readonly prefix: string;
}

type DrawTrashPrefix =
  | "[On Play] "
  | "[On K.O.] "
  | "[Trigger] "
  | "[When Attacking] "
  | "[When Attacking] [Once Per Turn] ";
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
      parsedRuleIds: parsedClauses.flatMap(getClauseParserRuleIds),
      sourceText: input.sourceText,
      sourceTextHash: input.sourceTextHash,
      unparsedSpans,
    });
  }

  const parserRuleIds = parsedClauses.flatMap(getClauseParserRuleIds);
  if (parserRuleIds.includes(conditionalContinuousTrashCountParserRuleId)) {
    return completeParse(input, parsedClauses);
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
    parseReturnDonCostWrapperResidueClause(line) ??
    parseCard014gResidueClause(cardId, line) ??
    parseTriggeredDrawResidueClause({
      cardId,
      effectIdPrefix: "auto-on-play",
      mode: "exact",
      parserRuleId: "exact:on-play:draw-n:self",
      prefix: "[On Play] ",
      sourceText: line,
      trigger: { type: "onPlay" },
    }) ??
    parseTriggeredDrawResidueClause({
      cardId,
      effectIdPrefix: "auto-on-play",
      mode: "upTo",
      parserRuleId: "exact:on-play:draw-up-to-n:self",
      prefix: "[On Play] ",
      sourceText: line,
      trigger: { type: "onPlay" },
    }) ??
    parseDrawThenTrashResidueClauseWithPrefix({
      cardId,
      effectIdPrefix: "auto-on-play",
      parserRuleId: "exact:on-play:draw-n:trash-m:hand:self",
      prefix: "[On Play] ",
      sourceText: line,
      trigger: { type: "onPlay" },
    }) ??
    parseTriggeredDrawResidueClause({
      cardId,
      effectIdPrefix: "auto-when-attacking",
      mode: "exact",
      parserRuleId: "exact:when-attacking:draw-n:self",
      prefix: "[When Attacking] ",
      sourceText: line,
      trigger: { type: "whenAttacking" },
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

function parseCardLineEffectClause(
  cardId: CardId,
  sourceText: string,
): CertifiedClause | undefined {
  return (
    parseConditionalContinuousCompositionClause(cardId, sourceText) ??
    parseNonConditionalCardLineEffectClause(cardId, sourceText) ??
    parseConditionalCardLineEffectClause(cardId, sourceText)
  );
}

const parseConditionalContinuousCompositionClause =
  buildConditionalContinuousCompositionClauseFromSource;

function parseNonConditionalCardLineEffectClause(
  cardId: CardId,
  sourceText: string,
): CertifiedClause | undefined {
  return (
    parseReusableCard016AClause(cardId, sourceText) ??
    parseOnPlayReturnDonDrawClause(cardId, sourceText) ??
    parseTriggerDrawClause(cardId, sourceText) ??
    parseTriggerDrawUpToClause(cardId, sourceText) ??
    parseOnKODrawClause(cardId, sourceText) ??
    parseOnKODrawUpToClause(cardId, sourceText) ??
    parseCard014gClause(cardId, sourceText) ??
    parseOnPlayDrawClause(cardId, sourceText) ??
    parseOnPlayDrawUpToClause(cardId, sourceText) ??
    parseOnPlayDrawThenTrashClause(cardId, sourceText) ??
    parseWhenAttackingModifyPowerChooseThisTurnClause(cardId, sourceText) ??
    parseWhenAttackingDrawClause(cardId, sourceText) ??
    parseWhenAttackingDrawThenTrashClause(cardId, sourceText) ??
    parseWhenAttackingOncePerTurnDrawThenTrashClause(cardId, sourceText)
  );
}

function parseConditionalCardLineEffectClause(
  cardId: CardId,
  sourceText: string,
): CertifiedClause | undefined {
  const conditional = parseConditionalWrapper(sourceText);
  if (conditional === undefined) {
    return undefined;
  }
  const base = parseNonConditionalCardLineEffectClause(
    cardId,
    `${conditional.prefix}${normalizeConditionalBodyText(conditional.bodyText)}`,
  );
  if (base?.effectBlock === undefined) {
    return undefined;
  }
  if (base.effectBlock.condition !== undefined) {
    return undefined;
  }

  const parserRuleId =
    base.parserRuleId === "exact:when-attacking:modify-power:choose:this-turn"
      ? "exact:when-attacking:conditional:modify-power:choose:this-turn"
      : base.parserRuleId;
  const parserRuleIds =
    parserRuleId ===
    "exact:when-attacking:conditional:modify-power:choose:this-turn"
      ? ([
          "exact:when-attacking:conditional:modify-power:choose:this-turn",
        ] as const)
      : base.parserRuleIds;

  return {
    ...base,
    effectBlock: {
      ...base.effectBlock,
      condition: conditional.condition,
    },
    parserRuleId,
    ...(parserRuleIds === undefined ? {} : { parserRuleIds }),
  };
}

function normalizeConditionalBodyText(bodyText: string): string {
  if (bodyText.length === 0) {
    return bodyText;
  }

  return `${bodyText[0]?.toUpperCase() ?? ""}${bodyText.slice(1)}`;
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
  return parseTriggeredDrawClause({
    cardId,
    effectIdPrefix: "auto-on-play",
    mode: "exact",
    parserRuleId: "exact:on-play:draw-n:self",
    prefix: "[On Play] ",
    sourceText,
    trigger: { type: "onPlay" },
  });
}

function parseOnPlayDrawUpToClause(
  cardId: CardId,
  sourceText: string,
): CertifiedClause | undefined {
  return parseTriggeredDrawClause({
    cardId,
    effectIdPrefix: "auto-on-play",
    mode: "upTo",
    parserRuleId: "exact:on-play:draw-up-to-n:self",
    prefix: "[On Play] ",
    sourceText,
    trigger: { type: "onPlay" },
  });
}

function parseWhenAttackingDrawClause(
  cardId: CardId,
  sourceText: string,
): CertifiedClause | undefined {
  return parseTriggeredDrawClause({
    cardId,
    effectIdPrefix: "auto-when-attacking",
    mode: "exact",
    parserRuleId: "exact:when-attacking:draw-n:self",
    prefix: "[When Attacking] ",
    sourceText,
    trigger: { type: "whenAttacking" },
  });
}

function parseWhenAttackingModifyPowerChooseThisTurnClause(
  cardId: CardId,
  sourceText: string,
): CertifiedClause | undefined {
  const wrapper = parseSupportedTriggerWrapper(sourceText);
  if (wrapper === undefined || wrapper.prefix !== "[When Attacking] ") {
    return undefined;
  }

  const modifier = parseContinuousModifierInstructionBody(wrapper.bodyText);
  if (
    modifier === undefined ||
    modifier.target !== "opponentCharactersChoose" ||
    modifier.duration !== "thisTurn"
  ) {
    return undefined;
  }

  return {
    effectBlock: {
      category: "auto",
      effect: {
        duration: { type: "thisTurn" },
        target: {
          request: opponentCharacterChooseTargetRequest(),
          type: "choose",
        },
        type: "modifyPower",
        value: modifier.value,
      },
      id: toEffectId(
        `${String(cardId)}:exact:when-attacking:modify-power:choose:this-turn`,
      ),
      sourcePresencePolicy: "mustRemainInSameZone",
      trigger: { type: "whenAttacking" },
    },
    parserRuleId: "exact:when-attacking:modify-power:choose:this-turn",
  };
}

function parseTriggerDrawClause(
  cardId: CardId,
  sourceText: string,
): CertifiedClause | undefined {
  return parseTriggeredDrawClause({
    cardId,
    effectIdPrefix: "auto-trigger",
    mode: "exact",
    parserRuleId: "exact:trigger:draw-n:self",
    prefix: "[Trigger] ",
    sourcePresencePolicy: "noSourceRequired",
    sourceText,
    trigger: { type: "trigger" },
  });
}

function parseTriggerDrawUpToClause(
  cardId: CardId,
  sourceText: string,
): CertifiedClause | undefined {
  return parseTriggeredDrawClause({
    cardId,
    effectIdPrefix: "auto-trigger",
    mode: "upTo",
    parserRuleId: "exact:trigger:draw-up-to-n:self",
    prefix: "[Trigger] ",
    sourcePresencePolicy: "noSourceRequired",
    sourceText,
    trigger: { type: "trigger" },
  });
}

function parseOnKODrawClause(
  cardId: CardId,
  sourceText: string,
): CertifiedClause | undefined {
  return parseTriggeredDrawClause({
    cardId,
    effectIdPrefix: "auto-on-ko",
    mode: "exact",
    parserRuleId: "exact:on-ko:draw-n:self",
    prefix: "[On K.O.] ",
    sourcePresencePolicy: "resolveFromDestinationZone",
    sourceText,
    trigger: { type: "onKO" },
  });
}

function parseOnKODrawUpToClause(
  cardId: CardId,
  sourceText: string,
): CertifiedClause | undefined {
  return parseTriggeredDrawClause({
    cardId,
    effectIdPrefix: "auto-on-ko",
    mode: "upTo",
    parserRuleId: "exact:on-ko:draw-up-to-n:self",
    prefix: "[On K.O.] ",
    sourcePresencePolicy: "resolveFromDestinationZone",
    sourceText,
    trigger: { type: "onKO" },
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

function parseTriggeredDrawResidueClause(
  options: TriggeredDrawClauseOptions,
): ParsedResidueClause | undefined {
  const wrapper = parseSupportedTriggerWrapper(options.sourceText);
  if (wrapper === undefined || wrapper.prefix !== options.prefix) {
    return undefined;
  }

  const pattern =
    options.mode === "exact"
      ? /^Draw (\d+) (card|cards)\. /
      : /^Draw up to (\d+) (card|cards)\. /;
  const match = wrapper.bodyText.match(pattern);
  if (match === null) {
    return undefined;
  }

  const prefix = `${wrapper.prefix}${match[0]}`;
  const clause = parseTriggeredDrawClause({
    ...options,
    sourceText: prefix.slice(0, -1),
  });
  return clause === undefined ? undefined : { clause, prefix };
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

function resolveImplementationStatus(clauses: readonly CertifiedClause[]) {
  return clauses.length > 0 &&
    clauses.every(
      (clause) => clause.implementationStatus === "vanilla-confirmed",
    )
    ? "vanilla-confirmed"
    : "implemented-dsl";
}
