import type {
  CardId,
  Effect,
  EffectBlock,
  EffectDefinition,
  EffectId,
  HandSelectionId,
  SequencedEffect,
  Trigger,
} from "@optcg/types";
import type {
  CompleteGeneratedSupportParseResult,
  GeneratedSupportDiagnosticDecomposition,
  GeneratedSupportParserResult,
  GeneratedSupportUnparsedSpan,
  PartialGeneratedSupportParseResult,
} from "./generated-support-types.js";
import {
  deriveConditionalDiagnosticDecomposition,
  deriveProtectionBodyDiagnosticDecomposition,
} from "./conditional-parser-components.js";
import { deriveConditionalContinuousCompositionDiagnosticDecomposition } from "./conditional-continuous-composition-diagnostics.js";
import { listComponentEvidenceIdsForParserRuleIds } from "./generated-support-types.js";
import {
  deriveReturnDonCostWrapperDiagnosticDecomposition,
  parseReturnDonCostWrapper,
} from "./return-don-cost-wrapper-components.js";
export { parseReturnDonCostWrapper } from "./return-don-cost-wrapper-components.js";

export type SupportedTriggerWrapperParse = {
  readonly bodyText: string;
  readonly prefix: string;
  readonly trigger: Extract<
    Trigger,
    { type: "onPlay" | "onKO" | "trigger" | "whenAttacking" }
  >;
};

export type OncePerTurnWrapperParse = {
  readonly bodyText: string;
  readonly prefix: string;
};
export type SequenceEffect = Extract<Effect, { type: "sequence" }>;

export type ReusableComposedParserClause = {
  readonly effectBlock?: EffectBlock;
  readonly implementationStatus?: "implemented-dsl" | "vanilla-confirmed";
  readonly nonRuntimeEvidence?: NonNullable<
    CompleteGeneratedSupportParseResult["nonRuntimeEvidence"]
  >[number];
  readonly parserRuleId: string;
  readonly parserRuleIds?: readonly string[];
};

export type ReusableComposedParserResidueClause<TClause> = {
  readonly clause: TClause;
  readonly prefix: string;
};
export type IfWrapperParse = {
  readonly bodyText: string;
  readonly conditionText: string;
  readonly conditions: readonly string[];
  readonly connector?: "and" | "or";
  readonly prefix: "If ";
};

export type UpToCardinalityParse = {
  readonly max: number;
  readonly min: 0;
  readonly text: string;
};
export type QuantityComparatorParse = {
  readonly field: "cost" | "power";
  readonly op: "gte" | "lte";
  readonly text: string;
  readonly value: number;
};

export type BooleanConnectorCandidate = {
  readonly connector: "and" | "or";
  readonly left: string;
  readonly right: string;
};
export type DrawInstructionParse = {
  readonly count: number;
  readonly mode: "exact" | "upTo";
};

export type TriggeredDrawClauseOptions = {
  readonly cardId: CardId;
  readonly effectIdPrefix: string;
  readonly mode: DrawInstructionParse["mode"];
  readonly parserRuleId: string;
  readonly prefix: SupportedTriggerWrapperParse["prefix"];
  readonly sourcePresencePolicy?: EffectBlock["sourcePresencePolicy"];
  readonly sourceText: string;
  readonly trigger: Extract<
    Trigger,
    { type: "onKO" | "onPlay" | "trigger" | "whenAttacking" }
  >;
};
export type TrashFromHandInstructionParse = {
  readonly count: number;
};

export type DrawThenTrashInstructionParse = {
  readonly drawCount: number;
  readonly trashCount: number;
};
export type TrashThenDrawInstructionParse = {
  readonly drawCount: number;
  readonly trashCount: number;
};

export type OptionalDrawInstructionParse = {
  readonly count: number;
};
export type ConditionedDrawInstructionParse =
  | {
      readonly condition: "yourTurn";
      readonly count: number;
    }
  | {
      readonly condition: "selfAttachedDonCount";
      readonly count: number;
      readonly donCount: number;
      readonly op: "gte";
    };

export type ReturnDonPlaySelectedFromHandParse = {
  readonly returnDonCount: number;
};
export type SelectOpponentCharacterInstructionParse = {
  readonly cardinality: {
    readonly max: 1;
    readonly min: 1;
  };
  readonly target: "opponentCharactersChoose";
};

export type SelectOpponentCharacterThenKoInstructionParse =
  SelectOpponentCharacterInstructionParse & {
    readonly savedReferenceConsumer: "koThatCharacter";
  };
export type PublicFieldTargetSubject =
  | "opponentCharactersAll"
  | "opponentCharactersChoose"
  | "self";
export type ContinuousModifierInstructionParse = {
  readonly duration: "thisBattle" | "thisTurn";
  readonly target: PublicFieldTargetSubject;
  readonly value: number;
};

export type ContinuousRestrictionInstructionParse = {
  readonly duration: "thisTurn";
  readonly restriction: "cannotAttack" | "cannotBlock";
  readonly target: PublicFieldTargetSubject;
};

export function parseSupportedTriggerWrapper(
  sourceText: string,
): SupportedTriggerWrapperParse | undefined {
  const supportedTriggers = [
    { prefix: "[On Play] ", trigger: { type: "onPlay" } },
    { prefix: "[On K.O.] ", trigger: { type: "onKO" } },
    { prefix: "[Trigger] ", trigger: { type: "trigger" } },
    { prefix: "[When Attacking] ", trigger: { type: "whenAttacking" } },
  ] as const;

  for (const supportedTrigger of supportedTriggers) {
    if (sourceText.startsWith(supportedTrigger.prefix)) {
      return {
        bodyText: sourceText.slice(supportedTrigger.prefix.length),
        prefix: supportedTrigger.prefix,
        trigger: supportedTrigger.trigger,
      };
    }
  }

  return undefined;
}

export function parseOncePerTurnWrapper(
  sourceText: string,
): OncePerTurnWrapperParse | undefined {
  const prefix = "[Once Per Turn] ";
  if (!sourceText.startsWith(prefix)) {
    return undefined;
  }

  return {
    bodyText: sourceText.slice(prefix.length),
    prefix,
  };
}

export function parseIfWrapper(sourceText: string): IfWrapperParse | undefined {
  const match = /^If\s+(.+?),\s*(.+)$/i.exec(sourceText.trim());
  if (match === null) {
    return undefined;
  }

  const conditionText = match[1]?.trim() ?? "";
  const bodyText = match[2]?.trim() ?? "";
  if (conditionText.length === 0 || bodyText.length === 0) {
    return undefined;
  }

  const connector = parseBooleanConnectorCandidate(conditionText);
  if (connector === undefined) {
    return {
      bodyText,
      conditionText,
      conditions: [conditionText],
      prefix: "If ",
    };
  }

  return {
    bodyText,
    conditionText,
    conditions: [connector.left, connector.right],
    connector: connector.connector,
    prefix: "If ",
  };
}

export function parseUpToCardinality(
  sourceText: string,
): UpToCardinalityParse | undefined {
  const match = /^up to (\d+)$/i.exec(sourceText.trim());
  if (match === null) {
    return undefined;
  }

  const max = parseExactPositiveSafeInteger(match[1] ?? "");
  if (max === undefined) {
    return undefined;
  }

  return {
    max,
    min: 0,
    text: match[0],
  };
}

export function parseQuantityComparator(
  sourceText: string,
): QuantityComparatorParse | undefined {
  const match = /^(\d+)\s+(power|cost)\s+or\s+(less|more)$/i.exec(
    sourceText.trim(),
  );
  if (match === null) {
    return undefined;
  }

  const value = parseExactPositiveSafeInteger(match[1] ?? "");
  if (value === undefined) {
    return undefined;
  }

  const fieldText = match[2]?.toLowerCase();
  const directionText = match[3]?.toLowerCase();
  if (
    (fieldText !== "power" && fieldText !== "cost") ||
    (directionText !== "less" && directionText !== "more")
  ) {
    return undefined;
  }

  return {
    field: fieldText,
    op: directionText === "less" ? "lte" : "gte",
    text: match[0],
    value,
  };
}

export function parseBooleanConnectorCandidate(
  sourceText: string,
): BooleanConnectorCandidate | undefined {
  if (parseQuantityComparator(sourceText) !== undefined) {
    return undefined;
  }

  const match = /^(.+?)\s+(and|or)\s+(.+)$/i.exec(sourceText.trim());
  if (match === null) {
    return undefined;
  }

  const left = match[1]?.trim() ?? "";
  const connector = match[2]?.toLowerCase();
  const right = match[3]?.trim() ?? "";
  if (
    left.length === 0 ||
    right.length === 0 ||
    /^(more|less)\b/i.test(right) ||
    (connector !== "and" && connector !== "or")
  ) {
    return undefined;
  }

  return { connector, left, right };
}

export function parseExactPositiveSafeInteger(
  countText: string,
): number | undefined {
  const count = Number.parseInt(countText, 10);
  if (!Number.isSafeInteger(count) || count <= 0) {
    return undefined;
  }

  if (countText !== String(count)) {
    return undefined;
  }

  return count;
}

export function parseDrawInstructionBody(
  sourceText: string,
): DrawInstructionParse | undefined {
  const match = /^(Draw|Draw up to) (\d+) (card|cards)\.$/.exec(sourceText);
  if (match === null) {
    return undefined;
  }

  const count = parsePositiveCardCount(match[2] ?? "", match[3]);
  if (count === undefined) {
    return undefined;
  }

  return {
    count,
    mode: match[1] === "Draw up to" ? "upTo" : "exact",
  };
}

export function parseTriggeredDrawClause(
  options: TriggeredDrawClauseOptions,
): ReusableComposedParserClause | undefined {
  const parsed = parseTriggeredDrawInstruction(options);
  if (parsed === undefined) {
    return undefined;
  }

  return createTriggeredDrawClauseWithCount(options, parsed.count);
}

function parseTriggeredDrawInstruction(
  options: TriggeredDrawClauseOptions,
): DrawInstructionParse | undefined {
  const wrapper = parseSupportedTriggerWrapper(options.sourceText);
  if (wrapper === undefined || wrapper.prefix !== options.prefix) {
    return undefined;
  }

  const parsed = parseDrawInstructionBody(wrapper.bodyText);
  return parsed?.mode === options.mode ? parsed : undefined;
}

function createTriggeredDrawClauseWithCount(
  options: TriggeredDrawClauseOptions,
  count: number,
): ReusableComposedParserClause {
  const effectType = options.mode === "upTo" ? "drawUpTo" : "draw";
  const effectIdMiddle = options.mode === "upTo" ? "draw-up-to" : "draw";

  return {
    effectBlock: {
      category: "auto",
      effect: { count, player: "self", type: effectType },
      id: toEffectId(
        `${String(options.cardId)}:${options.effectIdPrefix}-${effectIdMiddle}-${String(count)}`,
      ),
      sourcePresencePolicy:
        options.sourcePresencePolicy ?? "mustRemainInSameZone",
      trigger: options.trigger,
    },
    parserRuleId: options.parserRuleId,
  };
}

export function parseTrashFromHandInstructionBody(
  sourceText: string,
): TrashFromHandInstructionParse | undefined {
  const match = /^Trash (\d+) (card|cards) from your hand\.$/.exec(sourceText);
  if (match === null) {
    return undefined;
  }

  const count = parsePositiveCardCount(match[1] ?? "", match[2]);
  return count === undefined ? undefined : { count };
}

export function parseDrawThenTrashInstructionBody(
  sourceText: string,
): DrawThenTrashInstructionParse | undefined {
  const match =
    /^Draw (\d+) (card|cards) and trash (\d+) (card|cards) from your hand\.$/.exec(
      sourceText,
    );
  if (match === null) {
    return undefined;
  }

  const drawCount = parsePositiveCardCount(match[1] ?? "", match[2]);
  const trashCount = parsePositiveCardCount(match[3] ?? "", match[4]);
  return drawCount === undefined || trashCount === undefined
    ? undefined
    : { drawCount, trashCount };
}

export function parseTrashThenDrawInstructionBody(
  sourceText: string,
): TrashThenDrawInstructionParse | undefined {
  const [trashText, drawText] = sourceText.split(". ");
  if (trashText === undefined || drawText === undefined) {
    return undefined;
  }

  const trash = parseTrashFromHandInstructionBody(`${trashText}.`);
  const draw = parseDrawInstructionBody(drawText);
  if (trash === undefined || draw === undefined || draw.mode !== "exact") {
    return undefined;
  }

  return {
    drawCount: draw.count,
    trashCount: trash.count,
  };
}

export function parseOptionalDrawInstructionBody(
  sourceText: string,
): OptionalDrawInstructionParse | undefined {
  const match = /^You may draw (\d+) (card|cards)\.$/.exec(sourceText);
  if (match === null) {
    return undefined;
  }

  const count = parsePositiveCardCount(match[1] ?? "", match[2]);
  return count === undefined ? undefined : { count };
}

export function parseConditionedDrawInstructionBody(
  sourceText: string,
): ConditionedDrawInstructionParse | undefined {
  const yourTurnMatch = /^During your turn, draw (\d+) (card|cards)\.$/.exec(
    sourceText,
  );
  if (yourTurnMatch !== null) {
    const count = parsePositiveCardCount(
      yourTurnMatch[1] ?? "",
      yourTurnMatch[2],
    );
    return count === undefined ? undefined : { condition: "yourTurn", count };
  }

  const attachedDonMatch =
    /^If this Character has (\d+) or more DON!! cards attached, draw (\d+) (card|cards)\.$/.exec(
      sourceText,
    );
  if (attachedDonMatch === null) {
    return undefined;
  }

  const donCount = parseExactPositiveSafeInteger(attachedDonMatch[1] ?? "");
  const count = parsePositiveCardCount(
    attachedDonMatch[2] ?? "",
    attachedDonMatch[3],
  );
  return donCount === undefined || count === undefined
    ? undefined
    : { condition: "selfAttachedDonCount", count, donCount, op: "gte" };
}

export function parseReturnDonPlaySelectedFromHandInstructionBody(
  sourceText: string,
): ReturnDonPlaySelectedFromHandParse | undefined {
  const wrapper = parseReturnDonCostWrapper(sourceText);
  if (
    wrapper === undefined ||
    wrapper.bodyText !==
      "Select up to 1 Character card from your hand and play it."
  ) {
    return undefined;
  }

  return { returnDonCount: wrapper.count };
}

export function parseSelectOpponentCharacterInstructionBody(
  sourceText: string,
): SelectOpponentCharacterInstructionParse | undefined {
  return parseSelectOpponentCharacterSegment(sourceText);
}

export function parseSelectOpponentCharacterThenKoInstructionBody(
  sourceText: string,
): SelectOpponentCharacterThenKoInstructionParse | undefined {
  const [selectText, consumerText] = sourceText.split(". Then, ");
  if (selectText === undefined || consumerText === undefined) {
    return undefined;
  }

  const selection = parseSelectOpponentCharacterSegment(`${selectText}.`);
  const savedReferenceConsumer = parseSavedFieldObjectKoConsumer(consumerText);
  return selection === undefined || savedReferenceConsumer === undefined
    ? undefined
    : { ...selection, savedReferenceConsumer };
}

function parseSelectOpponentCharacterSegment(
  sourceText: string,
): SelectOpponentCharacterInstructionParse | undefined {
  const match = /^Select (.+) of (your opponent's Characters)\.$/.exec(
    sourceText,
  );
  if (match === null) {
    return undefined;
  }

  const cardinality = parseExactTargetCardinality(match[1] ?? "");
  const target = parseOpponentCharacterTargetText(match[2] ?? "");
  return cardinality === undefined || target === undefined
    ? undefined
    : { cardinality, target };
}

function parseExactTargetCardinality(
  sourceText: string,
): SelectOpponentCharacterInstructionParse["cardinality"] | undefined {
  const count = parseExactPositiveSafeInteger(sourceText);
  return count === 1 ? { max: 1, min: 1 } : undefined;
}

function parseOpponentCharacterTargetText(
  sourceText: string,
): "opponentCharactersChoose" | undefined {
  return sourceText === "your opponent's Characters"
    ? "opponentCharactersChoose"
    : undefined;
}

function parseSavedFieldObjectKoConsumer(
  sourceText: string,
): "koThatCharacter" | undefined {
  return sourceText === "K.O. that Character." ? "koThatCharacter" : undefined;
}

export function parseContinuousModifierInstructionBody(
  sourceText: string,
): ContinuousModifierInstructionParse | undefined {
  const match =
    /^(This Character|All of your opponent's Characters|Up to 1 of your opponent's Characters) gets? ([+\-−]\d+) power during (this turn|this battle)\.$/.exec(
      sourceText,
    ) ??
    /^(Give up to 1 of your opponent's Characters) ([+\-−]\d+) power during (this turn)\.$/.exec(
      sourceText,
    );
  if (match === null) {
    return undefined;
  }

  const target = parsePublicFieldTargetSubject(
    (match[1] ?? "").replace(/^Give up to 1/, "Up to 1"),
  );
  const value = parseSignedSafeInteger(match[2] ?? "");
  const duration = parseDuration(match[3] ?? "");
  if (target === undefined || value === undefined || duration === undefined) {
    return undefined;
  }

  return { duration, target, value };
}

export function parseContinuousRestrictionInstructionBody(
  sourceText: string,
): ContinuousRestrictionInstructionParse | undefined {
  const match =
    /^(This Character|All of your opponent's Characters|Up to 1 of your opponent's Characters) cannot (attack|block) during this turn\.$/.exec(
      sourceText,
    );
  if (match === null) {
    return undefined;
  }

  const target = parsePublicFieldTargetSubject(match[1] ?? "");
  const action = match[2];
  if (target === undefined || (action !== "attack" && action !== "block")) {
    return undefined;
  }

  return {
    duration: "thisTurn",
    restriction: action === "attack" ? "cannotAttack" : "cannotBlock",
    target,
  };
}

function parsePublicFieldTargetSubject(
  sourceText: string,
): PublicFieldTargetSubject | undefined {
  switch (sourceText) {
    case "All of your opponent's Characters":
      return "opponentCharactersAll";
    case "This Character":
      return "self";
    case "Up to 1 of your opponent's Characters":
      return "opponentCharactersChoose";
    default:
      return undefined;
  }
}

function parseDuration(
  sourceText: string,
): ContinuousModifierInstructionParse["duration"] | undefined {
  switch (sourceText) {
    case "this battle":
      return "thisBattle";
    case "this turn":
      return "thisTurn";
    default:
      return undefined;
  }
}

function parseSignedSafeInteger(sourceText: string): number | undefined {
  if (!/^[+\-−]\d+$/.test(sourceText)) {
    return undefined;
  }

  const normalized = sourceText.startsWith("−")
    ? `-${sourceText.slice(1)}`
    : sourceText;
  const value = Number.parseInt(normalized, 10);
  return Number.isSafeInteger(value) ? value : undefined;
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

export function buildSequenceEffect(
  segments: readonly SequencedEffect[],
): SequenceEffect {
  return {
    effects: segments.map((segment) => ({ ...segment })),
    type: "sequence",
  };
}

export function parseReusableCard016ABaseClause(
  cardId: CardId,
  sourceText: string,
): ReusableComposedParserClause | undefined {
  return (
    parseCard014fComponentClause(cardId, sourceText) ??
    parseOnPlayTrashThenDrawComponentClause(cardId, sourceText) ??
    parseOnPlayReturnDonPlaySelectedCharacterFromHandComponentClause(
      cardId,
      sourceText,
    )
  );
}

function parseCard014fComponentClause(
  cardId: CardId,
  sourceText: string,
): ReusableComposedParserClause | undefined {
  const wrapper = parseSupportedTriggerWrapper(sourceText);
  if (wrapper === undefined || wrapper.prefix !== "[On Play] ") {
    return undefined;
  }

  const optionalDraw = parseOptionalDrawInstructionBody(wrapper.bodyText);
  if (optionalDraw !== undefined && optionalDraw.count === 1) {
    return {
      effectBlock: {
        category: "auto",
        effect: { count: 1, player: "self", type: "draw" },
        id: toEffectId(`${String(cardId)}:auto-on-play-optional-draw-1`),
        optional: true,
        sourcePresencePolicy: "mustRemainInSameZone",
        trigger: { type: "onPlay" },
      },
      parserRuleId: "exact:on-play:optional-effect:draw-1:self",
    };
  }

  const conditionedDraw = parseConditionedDrawInstructionBody(wrapper.bodyText);
  if (conditionedDraw === undefined || conditionedDraw.count !== 1) {
    return undefined;
  }

  if (conditionedDraw.condition === "yourTurn") {
    return {
      effectBlock: {
        category: "auto",
        condition: { type: "yourTurn" },
        effect: { count: 1, player: "self", type: "draw" },
        id: toEffectId(`${String(cardId)}:auto-on-play-your-turn-draw-1`),
        sourcePresencePolicy: "mustRemainInSameZone",
        trigger: { type: "onPlay" },
      },
      parserRuleId: "exact:condition:your-turn",
    };
  }

  if (conditionedDraw.donCount !== 1) {
    return undefined;
  }

  return {
    effectBlock: {
      category: "auto",
      condition: {
        op: "gte",
        target: { type: "self" },
        type: "attachedDonCount",
        value: 1,
      },
      effect: { count: 1, player: "self", type: "draw" },
      id: toEffectId(
        `${String(cardId)}:auto-on-play-self-attached-don-count-gte-1-draw-1`,
      ),
      sourcePresencePolicy: "mustRemainInSameZone",
      trigger: { type: "onPlay" },
    },
    parserRuleId: "exact:condition:self-attached-don-count",
  };
}

function parseOnPlayTrashThenDrawComponentClause(
  cardId: CardId,
  sourceText: string,
): ReusableComposedParserClause | undefined {
  const wrapper = parseSupportedTriggerWrapper(sourceText);
  if (wrapper === undefined || wrapper.prefix !== "[On Play] ") {
    return undefined;
  }

  const parsed = parseTrashThenDrawInstructionBody(wrapper.bodyText);
  if (
    parsed === undefined ||
    parsed.trashCount !== 2 ||
    parsed.drawCount !== 1
  ) {
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
            count: parsed.trashCount,
            player: "self",
            type: "trashFromHand",
          },
        },
        {
          connector: "then",
          effect: { count: parsed.drawCount, player: "self", type: "draw" },
        },
      ]),
      id: toEffectId(
        `${String(cardId)}:auto-on-play-trash-${String(
          parsed.trashCount,
        )}-then-draw-${String(parsed.drawCount)}`,
      ),
      sourcePresencePolicy: "mustRemainInSameZone",
      trigger: { type: "onPlay" },
    },
    parserRuleId: "exact:on-play:trash-2-from-hand:draw-1:self",
  };
}

function parseOnPlayReturnDonPlaySelectedCharacterFromHandComponentClause(
  cardId: CardId,
  sourceText: string,
): ReusableComposedParserClause | undefined {
  const wrapper = parseSupportedTriggerWrapper(sourceText);
  if (wrapper === undefined || wrapper.prefix !== "[On Play] ") {
    return undefined;
  }

  const parsed = parseReturnDonPlaySelectedFromHandInstructionBody(
    wrapper.bodyText,
  );
  if (parsed === undefined) {
    return undefined;
  }

  return createReturnDonPlaySelectedCharacterFromHandClause(
    cardId,
    parsed.returnDonCount,
  );
}

function createReturnDonPlaySelectedCharacterFromHandClause(
  cardId: CardId,
  returnDonCount: number,
): ReusableComposedParserClause {
  const handSelectionId = "handSelection:playableCharacter" as HandSelectionId;

  return {
    effectBlock: {
      category: "auto",
      effect: buildSequenceEffect([
        {
          connector: "always",
          effect: {
            cost: { count: returnDonCount, optional: true, type: "returnDon" },
            type: "payCost",
          },
          saveResultAs: "paidReturnDonCost",
        },
        {
          connector: "ifYouDo",
          effect: {
            chooser: "self",
            filter: { categories: ["character"] },
            max: 1,
            min: 0,
            player: "self",
            saveAs: handSelectionId,
            type: "selectCards",
            visibility: "chooserOnly",
            zone: "hand",
          },
        },
        {
          connector: "ifPreviousSucceeded",
          effect: {
            enterRested: true,
            ignoreCost: true,
            selection: handSelectionId,
            type: "playSelected",
          },
        },
      ]),
      id: toEffectId(
        `${String(cardId)}:auto-on-play-return-don-${String(
          returnDonCount,
        )}-play-selected-character-from-hand`,
      ),
      sourcePresencePolicy: "mustRemainInSameZone",
      trigger: { type: "onPlay" },
    },
    parserRuleId:
      "exact:on-play:return-don-select-up-to-1-character-from-hand-play-selected",
  };
}

export function toEffectId(value: string): EffectId {
  return value as EffectId;
}

export function findReusableComposedResiduePrefix<TClause>(
  sourceText: string,
  parsePrefix: (prefix: string) => TClause | undefined,
): ReusableComposedParserResidueClause<TClause> | undefined {
  for (let index = sourceText.lastIndexOf(". "); index > 0; ) {
    const prefix = sourceText.slice(0, index + 2);
    const clause = parsePrefix(prefix.slice(0, -1));
    if (clause !== undefined) {
      return { clause, prefix };
    }

    index = sourceText.lastIndexOf(". ", index - 1);
  }

  return undefined;
}

export function createDeterministicParserRuleId(
  parts: readonly string[],
): string {
  if (parts.length === 0) {
    throw new Error("Parser rule IDs require at least one part.");
  }

  if (parts.some((part) => part.length === 0)) {
    throw new Error("Parser rule ID parts must be non-empty.");
  }

  if (parts.some((part) => part.includes(":"))) {
    throw new Error("Parser rule ID parts must not contain ':'.");
  }

  return parts.join(":");
}

export function buildResidueSpan({
  offset,
  prefix,
  source,
}: {
  readonly offset: number;
  readonly prefix: string;
  readonly source: string;
}): GeneratedSupportUnparsedSpan {
  const start = offset + prefix.length;
  return {
    end: offset + source.length,
    start,
    text: source.slice(prefix.length),
  };
}

export function buildCompleteParseResult({
  cardId,
  effectDefinition,
  nonRuntimeEvidence,
  parserRuleIds,
  sourceText,
  sourceTextHash,
}: {
  readonly cardId: CardId;
  readonly effectDefinition: EffectDefinition;
  readonly nonRuntimeEvidence?: CompleteGeneratedSupportParseResult["nonRuntimeEvidence"];
  readonly parserRuleIds: readonly string[];
  readonly sourceText: string;
  readonly sourceTextHash: string;
}): CompleteGeneratedSupportParseResult {
  return {
    cardId,
    componentEvidenceIds:
      listComponentEvidenceIdsForParserRuleIds(parserRuleIds),
    effectDefinition,
    ...(nonRuntimeEvidence === undefined ? {} : { nonRuntimeEvidence }),
    parserRuleIds,
    sourceText,
    sourceTextHash,
    status: "complete",
  };
}

export function buildPartialParseResult({
  cardId,
  message,
  parsedRuleIds,
  sourceText,
  sourceTextHash,
  unparsedSpans,
}: {
  readonly cardId: CardId;
  readonly message: string;
  readonly parsedRuleIds: readonly string[];
  readonly sourceText: string;
  readonly sourceTextHash: string;
  readonly unparsedSpans: readonly GeneratedSupportUnparsedSpan[];
}): PartialGeneratedSupportParseResult {
  return {
    blockers: unparsedSpans.map((span) => ({
      code: "unparsed-span",
      message,
      span,
    })),
    cardId,
    parsedComponentEvidenceIds:
      listComponentEvidenceIdsForParserRuleIds(parsedRuleIds),
    parsedRuleIds,
    sourceText,
    sourceTextHash,
    status: "partial",
    unparsedSpans,
  };
}

export function buildUnsupportedWholeTextParseResult({
  cardId,
  sourceText,
  sourceTextHash,
}: {
  readonly cardId: CardId;
  readonly sourceText: string;
  readonly sourceTextHash: string;
}): GeneratedSupportParserResult {
  return buildPartialParseResult({
    cardId,
    message: "Card text is not covered by certified parser rules.",
    parsedRuleIds: [],
    sourceText,
    sourceTextHash,
    unparsedSpans: [
      {
        end: sourceText.length,
        start: 0,
        text: sourceText,
      },
    ],
  });
}

export function deriveParserDiagnosticDecomposition(
  text: string,
  fullSourceText: string,
): GeneratedSupportDiagnosticDecomposition | undefined {
  const normalized = text.trim();
  const returnDonCostWrapperDiagnostic =
    deriveReturnDonCostWrapperDiagnosticDecomposition(
      normalized,
      fullSourceText,
    );
  if (returnDonCostWrapperDiagnostic !== undefined) {
    return returnDonCostWrapperDiagnostic;
  }

  if (!isWholeSourceOrLine(normalized, fullSourceText)) {
    return undefined;
  }

  return (
    deriveConditionalContinuousCompositionDiagnosticDecomposition(normalized) ??
    deriveConditionalDiagnosticDecomposition(normalized) ??
    deriveProtectionBodyDiagnosticDecomposition(normalized) ??
    deriveBottomDeckDiagnosticDecomposition(normalized)
  );
}

function isWholeSourceOrLine(text: string, fullSourceText: string): boolean {
  const normalizedFullSourceText = fullSourceText.trim();
  if (text === normalizedFullSourceText) {
    return true;
  }

  return normalizedFullSourceText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .includes(text);
}

function deriveBottomDeckDiagnosticDecomposition(
  sourceText: string,
): GeneratedSupportDiagnosticDecomposition | undefined {
  const trigger = parseSupportedTriggerWrapper(sourceText);
  if (trigger === undefined || trigger.prefix !== "[On Play] ") {
    return undefined;
  }

  const match =
    /^Place\s+(up to \d+)\s+of\s+(your opponent's Characters)\s+with\s+(\d+\s+(?:power|cost)\s+or\s+(?:less|more))\s+at\s+the bottom of the owner's deck\.?$/i.exec(
      trigger.bodyText,
    );
  if (match === null) {
    return undefined;
  }

  const cardinalityText = match[1] ?? "";
  const targetText = match[2] ?? "";
  const predicateText = match[3] ?? "";
  if (
    parseUpToCardinality(cardinalityText) === undefined ||
    parseQuantityComparator(predicateText) === undefined
  ) {
    return undefined;
  }

  return {
    recognizedActionCandidates: ["place at the bottom of the owner's deck"],
    recognizedSyntaxFragments: [
      "trigger-wrapper:onPlay",
      "cardinality:up-to",
      "target:opponent-characters",
      "predicate:quantity-comparator",
      "destination:owner-deck-bottom",
    ],
    recognizedTriggerCandidates: [trigger.prefix.trim()],
    reason:
      "Parser components were recognized, but the complete action/destination shape is not certified with existing schema and runtime capability evidence; generated support remains fail-closed.",
    traceComponents: [
      { kind: "trigger", status: "recognized", text: trigger.prefix.trim() },
      { kind: "cardinality", status: "recognized", text: cardinalityText },
      { kind: "target", status: "recognized", text: targetText },
      { kind: "predicate", status: "recognized", text: predicateText },
      {
        kind: "action",
        status: "recognized",
        text: "place at the bottom of the owner's deck",
      },
      {
        kind: "destination",
        status: "unsupported",
        text: "bottom of the owner's deck",
      },
    ],
    unsupportedConditionFragments: [],
    unsupportedSyntaxFragments: ["action/destination:bottom-of-owner-deck"],
  };
}
