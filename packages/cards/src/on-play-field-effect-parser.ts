import type {
  CardId,
  EffectBlock,
  EffectId,
  SelectedTargetsRequest,
  Target,
} from "@optcg/types";

import {
  buildSequenceEffect,
  isSupportedTriggerType,
  parseContinuousModifierInstructionBody,
  parseContinuousRestrictionInstructionBody,
  parseSelectOpponentCharacterInstructionBody,
  parseSelectOpponentCharacterThenKoInstructionBody,
  parseSupportedTriggerWrapper,
  parseTrashFromHandInstructionBody,
} from "./composed-parser-builder.js";

export interface Card014gCertifiedClause {
  readonly effectBlock: EffectBlock;
  readonly parserRuleId: string;
}

export interface Card014gResidueClause {
  readonly clause: Card014gCertifiedClause;
  readonly prefix: string;
}

type PublicFieldTargetSubject =
  | "opponentCharactersAll"
  | "opponentCharactersChoose"
  | "self";

type SupportedDuration = "thisBattle" | "thisTurn";

export function parseCard014gClause(
  cardId: CardId,
  sourceText: string,
): Card014gCertifiedClause | undefined {
  const wrapper = parseSupportedTriggerWrapper(sourceText);
  if (!isSupportedTriggerType(wrapper, "onPlay")) {
    return undefined;
  }

  return parseOnPlayFieldEffectBody(cardId, wrapper.bodyText);
}

export function parseCard014gResidueClause(
  cardId: CardId,
  sourceText: string,
): Card014gResidueClause | undefined {
  for (let index = sourceText.lastIndexOf(". "); index > 0; ) {
    const prefix = sourceText.slice(0, index + 2);
    const clause = parseCard014gClause(cardId, prefix.slice(0, -1));
    if (clause !== undefined) {
      return { clause, prefix };
    }

    index = sourceText.lastIndexOf(". ", index - 1);
  }

  return undefined;
}

export function parseOnPlayTrashFromHandClause(
  cardId: CardId,
  sourceText: string,
): Card014gCertifiedClause | undefined {
  const wrapper = parseSupportedTriggerWrapper(sourceText);
  if (wrapper?.prefix !== "[On Play] ") {
    return undefined;
  }

  const parsed = parseTrashFromHandInstructionBody(wrapper.bodyText);
  return parsed === undefined
    ? undefined
    : {
        effectBlock: {
          category: "auto",
          effect: {
            chooser: "self",
            count: parsed.count,
            player: "self",
            type: "trashFromHand",
          },
          id: toEffectId(
            `${String(cardId)}:auto-on-play-trash-${String(parsed.count)}-from-hand`,
          ),
          sourcePresencePolicy: "mustRemainInSameZone",
          trigger: { type: "onPlay" },
        },
        parserRuleId: "exact:on-play:trash-n-from-hand:self",
      };
}

function parseOnPlayFieldEffectBody(
  cardId: CardId,
  bodyText: string,
): Card014gCertifiedClause | undefined {
  const selectThenKo =
    parseSelectOpponentCharacterThenKoInstructionBody(bodyText);
  if (selectThenKo !== undefined) {
    return createSelectThenKoClause(cardId);
  }

  const select = parseSelectOpponentCharacterInstructionBody(bodyText);
  if (select !== undefined) {
    return createSelectOpponentCharacterClause(cardId);
  }

  const modifier = parseCard014gModifierInstructionBody(bodyText);
  if (modifier !== undefined) {
    return createModifyPowerClause(
      cardId,
      modifier.target,
      modifier.duration,
      modifier.value,
    );
  }

  const restriction = parseContinuousRestrictionInstructionBody(bodyText);
  if (restriction !== undefined) {
    return createRestrictionClause(
      cardId,
      restriction.restriction,
      restriction.target,
      restriction.duration,
    );
  }

  return undefined;
}

function parseCard014gModifierInstructionBody(
  bodyText: string,
): ReturnType<typeof parseContinuousModifierInstructionBody> {
  if (!isOnPlayFieldEffectModifierWording(bodyText)) {
    return undefined;
  }

  return parseContinuousModifierInstructionBody(bodyText);
}

export function isOnPlayFieldEffectModifierWording(bodyText: string) {
  return [
    /^This Character gets [+\-\u2212]\d+ power during (this turn|this battle)\.$/,
    /^All of your opponent's Characters get [+\-\u2212]\d+ power during (this turn|this battle)\.$/,
    /^Up to 1 of your opponent's Characters gets [+\-\u2212]\d+ power during (this turn|this battle)\.$/,
  ].some((pattern) => pattern.test(bodyText));
}

function createSelectOpponentCharacterClause(
  cardId: CardId,
): Card014gCertifiedClause {
  return createClause({
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

function createSelectThenKoClause(cardId: CardId): Card014gCertifiedClause {
  return createClause({
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

function createModifyPowerClause(
  cardId: CardId,
  target: PublicFieldTargetSubject,
  duration: SupportedDuration,
  value: number,
): Card014gCertifiedClause | undefined {
  const targetSegment = toTargetParserSegment(target);
  const durationSegment = toDurationParserSegment(duration);
  if (targetSegment === undefined || durationSegment === undefined) {
    return undefined;
  }

  const parserRuleId = `exact:on-play:modify-power:${targetSegment}:${durationSegment}`;
  return createClause({
    cardId,
    effect: {
      duration: { type: duration },
      target: toTarget(target),
      type: "modifyPower",
      value,
    },
    effectIdSuffix: parserRuleId,
    parserRuleId,
  });
}

function createRestrictionClause(
  cardId: CardId,
  restriction: "cannotAttack" | "cannotBlock",
  target: PublicFieldTargetSubject,
  duration: "thisTurn",
): Card014gCertifiedClause | undefined {
  const targetSegment = toTargetParserSegment(target);
  if (targetSegment === undefined) {
    return undefined;
  }

  const actionSegment =
    restriction === "cannotAttack" ? "cannot-attack" : "cannot-block";
  const parserRuleId = `exact:on-play:${actionSegment}:${targetSegment}:this-turn`;
  return createClause({
    cardId,
    effect: {
      duration: { type: duration },
      target: toTarget(target),
      type: restriction,
    },
    effectIdSuffix: parserRuleId,
    parserRuleId,
  });
}

function createClause({
  cardId,
  effect,
  effectIdSuffix,
  parserRuleId,
}: {
  readonly cardId: CardId;
  readonly effect: EffectBlock["effect"];
  readonly effectIdSuffix: string;
  readonly parserRuleId: string;
}): Card014gCertifiedClause {
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

function toTargetParserSegment(
  target: PublicFieldTargetSubject,
): "all" | "choose" | "self" | undefined {
  switch (target) {
    case "opponentCharactersAll":
      return "all";
    case "opponentCharactersChoose":
      return "choose";
    case "self":
      return "self";
  }
}

function toDurationParserSegment(
  duration: SupportedDuration,
): "this-battle" | "this-turn" | undefined {
  switch (duration) {
    case "thisBattle":
      return "this-battle";
    case "thisTurn":
      return "this-turn";
  }
}

function toTarget(target: PublicFieldTargetSubject): Target {
  switch (target) {
    case "opponentCharactersAll":
      return opponentCharactersAllTarget();
    case "opponentCharactersChoose":
      return opponentCharactersChooseTarget();
    case "self":
      return { type: "self" };
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

function opponentCharactersChooseTarget(): Extract<Target, { type: "choose" }> {
  return {
    request: opponentCharacterChooseTargetRequest(),
    type: "choose",
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

function opponentCharactersAllTarget(): Extract<Target, { type: "all" }> {
  return {
    filter: { categories: ["character"] },
    player: "opponent",
    type: "all",
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

function toEffectId(value: string): EffectId {
  return value as EffectId;
}
