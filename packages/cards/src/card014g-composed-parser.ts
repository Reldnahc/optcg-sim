import type {
  CardId,
  Effect,
  EffectBlock,
  EffectId,
  SelectedTargetsRequest,
  Target,
} from "@optcg/types";

import { buildSequenceEffect } from "./composed-parser-builder.js";

export interface Card014gCertifiedClause {
  readonly effectBlock: EffectBlock;
  readonly parserRuleId: string;
}

export interface Card014gResidueClause {
  readonly clause: Card014gCertifiedClause;
  readonly prefix: string;
}

interface Card014gTemplate {
  readonly createEffect: () => Effect;
  readonly effectIdSuffix: string;
  readonly parserRuleId: string;
}

export function parseCard014gClause(
  cardId: CardId,
  sourceText: string,
): Card014gCertifiedClause | undefined {
  const template = card014gTemplatesByText[sourceText];

  return template === undefined
    ? undefined
    : createCard014gClause(cardId, template);
}

export function parseCard014gResidueClause(
  cardId: CardId,
  sourceText: string,
): Card014gResidueClause | undefined {
  const entry = Object.entries(card014gTemplatesByText).find(([text]) =>
    sourceText.startsWith(`${text} `),
  );
  if (entry === undefined) {
    return undefined;
  }

  const [text, template] = entry;

  return {
    clause: createCard014gClause(cardId, template),
    prefix: `${text} `,
  };
}

function createCard014gClause(
  cardId: CardId,
  template: Card014gTemplate,
): Card014gCertifiedClause {
  return {
    effectBlock: {
      category: "auto",
      effect: template.createEffect(),
      id: toEffectId(`${String(cardId)}:${template.effectIdSuffix}`),
      sourcePresencePolicy: "mustRemainInSameZone",
      trigger: { type: "onPlay" },
    },
    parserRuleId: template.parserRuleId,
  };
}

const card014gTemplatesByText: Readonly<Record<string, Card014gTemplate>> = {
  "[On Play] All of your opponent's Characters cannot attack during this turn.":
    {
      createEffect: () => ({
        duration: { type: "thisTurn" },
        target: opponentCharactersAllTarget(),
        type: "cannotAttack",
      }),
      effectIdSuffix: "exact:on-play:cannot-attack:all:this-turn",
      parserRuleId: "exact:on-play:cannot-attack:all:this-turn",
    },
  "[On Play] All of your opponent's Characters cannot block during this turn.":
    {
      createEffect: () => ({
        duration: { type: "thisTurn" },
        target: opponentCharactersAllTarget(),
        type: "cannotBlock",
      }),
      effectIdSuffix: "exact:on-play:cannot-block:all:this-turn",
      parserRuleId: "exact:on-play:cannot-block:all:this-turn",
    },
  "[On Play] All of your opponent's Characters get -2000 power during this turn.":
    {
      createEffect: () => ({
        duration: { type: "thisTurn" },
        target: opponentCharactersAllTarget(),
        type: "modifyPower",
        value: -2000,
      }),
      effectIdSuffix: "exact:on-play:modify-power:all:this-turn",
      parserRuleId: "exact:on-play:modify-power:all:this-turn",
    },
  "[On Play] Select 1 of your opponent's Characters.": {
    createEffect: () =>
      buildSequenceEffect([
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
  },
  "[On Play] Select 1 of your opponent's Characters. Then, K.O. that Character.":
    {
      createEffect: () =>
        buildSequenceEffect([
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
    },
  "[On Play] This Character cannot attack during this turn.": {
    createEffect: () => ({
      duration: { type: "thisTurn" },
      target: { type: "self" },
      type: "cannotAttack",
    }),
    effectIdSuffix: "exact:on-play:cannot-attack:self:this-turn",
    parserRuleId: "exact:on-play:cannot-attack:self:this-turn",
  },
  "[On Play] This Character cannot block during this turn.": {
    createEffect: () => ({
      duration: { type: "thisTurn" },
      target: { type: "self" },
      type: "cannotBlock",
    }),
    effectIdSuffix: "exact:on-play:cannot-block:self:this-turn",
    parserRuleId: "exact:on-play:cannot-block:self:this-turn",
  },
  "[On Play] This Character gets +1000 power during this battle.": {
    createEffect: () => ({
      duration: { type: "thisBattle" },
      target: { type: "self" },
      type: "modifyPower",
      value: 1000,
    }),
    effectIdSuffix: "exact:on-play:modify-power:self:this-battle",
    parserRuleId: "exact:on-play:modify-power:self:this-battle",
  },
  "[On Play] This Character gets +1000 power during this turn.": {
    createEffect: () => ({
      duration: { type: "thisTurn" },
      target: { type: "self" },
      type: "modifyPower",
      value: 1000,
    }),
    effectIdSuffix: "exact:on-play:modify-power:self:this-turn",
    parserRuleId: "exact:on-play:modify-power:self:this-turn",
  },
  "[On Play] Up to 1 of your opponent's Characters cannot attack during this turn.":
    {
      createEffect: () => ({
        duration: { type: "thisTurn" },
        target: opponentCharactersChooseTarget(),
        type: "cannotAttack",
      }),
      effectIdSuffix: "exact:on-play:cannot-attack:choose:this-turn",
      parserRuleId: "exact:on-play:cannot-attack:choose:this-turn",
    },
  "[On Play] Up to 1 of your opponent's Characters cannot block during this turn.":
    {
      createEffect: () => ({
        duration: { type: "thisTurn" },
        target: opponentCharactersChooseTarget(),
        type: "cannotBlock",
      }),
      effectIdSuffix: "exact:on-play:cannot-block:choose:this-turn",
      parserRuleId: "exact:on-play:cannot-block:choose:this-turn",
    },
  "[On Play] Up to 1 of your opponent's Characters gets -2000 power during this turn.":
    {
      createEffect: () => ({
        duration: { type: "thisTurn" },
        target: opponentCharactersChooseTarget(),
        type: "modifyPower",
        value: -2000,
      }),
      effectIdSuffix: "exact:on-play:modify-power:choose:this-turn",
      parserRuleId: "exact:on-play:modify-power:choose:this-turn",
    },
};

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
