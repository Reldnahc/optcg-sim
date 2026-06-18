import type {
  Duration,
  Effect,
  EffectEntryPointFilter,
  SavedFieldObjectZone,
  Target,
} from "@optcg/types";

import { parseUpToCardinality } from "../cardinality/index.js";
import {
  attackRestrictionDurationParsers,
  fieldEffectDurationParsers,
  parseDurationFromSet,
  thisTurnOnlyDurationParsers,
} from "../durations/index.js";
import { supportedEntryPoints } from "../entry-point-definitions.js";
import { parseNegativePowerModifier } from "../modifiers/index.js";
import {
  parseOpponentCharactersTarget,
  parseOpponentLeaderOrCharacterCardsTarget,
} from "../targets/index.js";
import type { InstructionParser, PrimitiveEvidence } from "../types.js";
import {
  savedFieldObjectTarget,
  selectThenApplyFieldTarget,
} from "./effect-builders.js";

const invalidateEffectsTargetSelectionId = "selected:invalidate-effects-target";

export const invalidateEffectsInstructionPrimitive = {
  primitiveId: "instruction:invalidateEffects",
  childPrimitiveIds: [
    "cardinality:upTo",
    "cardinality:all",
    "target:opponentLeader",
    "target:opponentCharacters",
    "target:opponentLeaderOrCharacters",
    "duration:thisTurn",
    "duration:opponentNextEndPhase",
    "composition:selectThenApply",
  ],
} as const;

export const parseInvalidateEffectsInstruction: InstructionParser = (input) => {
  const entryPointInvalidation =
    parseEntryPointEffectInvalidationInstruction(input);
  if (entryPointInvalidation !== undefined) {
    return entryPointInvalidation;
  }

  if (
    /^this Character's effect is negated during this turn\.?$/iu.test(
      input.text,
    )
  ) {
    return {
      effect: {
        type: "invalidateEffects",
        target: { type: "self" },
        duration: { type: "thisTurn" },
      },
      evidence: [
        "instruction:invalidateEffects",
        "target:thisCharacter",
        "duration:thisTurn",
      ],
      rest: "",
    };
  }

  const actionMatch = /^Negate the effects? of\s+(?<rest>.*)$/i.exec(
    input.text,
  );
  const actionRest = actionMatch?.groups?.["rest"];
  if (actionRest === undefined) {
    return undefined;
  }

  const opponentLeaderAndAllCharacters =
    parseOpponentLeaderAndAllCharactersInvalidateEffects(actionRest);
  if (opponentLeaderAndAllCharacters !== undefined) {
    return opponentLeaderAndAllCharacters;
  }

  const opponentLeaderAndCharacterEach =
    parseOpponentLeaderAndCharacterEachInvalidateEffects(actionRest);
  if (opponentLeaderAndCharacterEach !== undefined) {
    return opponentLeaderAndCharacterEach;
  }

  const cardinality = parseUpToCardinality({ text: actionRest });
  if (cardinality === undefined) {
    return undefined;
  }

  const opponentLeader = parseOpponentLeaderTarget(cardinality.rest);
  if (opponentLeader !== undefined) {
    const combined = parseOptionalFollowupEffects(opponentLeader.rest);
    if (combined === undefined) {
      return undefined;
    }
    return {
      effect: selectThenApplyInvalidateEffects(
        cardinality.cardinality.min,
        cardinality.cardinality.max,
        opponentLeader.filter,
        combined.duration,
        {
          zones: ["leaderArea"],
          ...(combined.followupEffects === undefined
            ? {}
            : { followupEffects: combined.followupEffects }),
        },
      ),
      evidence: [
        "instruction:invalidateEffects",
        ...cardinality.evidence,
        "chooser:self:upTo",
        ...opponentLeader.evidence,
        ...combined.evidence,
        "composition:selectThenApply",
      ],
      rest: "",
    };
  }

  const leaderOrCharacter = parseOpponentLeaderOrCharacterCardsTarget({
    text: cardinality.rest,
  });
  if (leaderOrCharacter?.target?.type === "chooseFromZones") {
    const combined = parseOptionalFollowupEffects(leaderOrCharacter.rest);
    if (combined === undefined) {
      return undefined;
    }
    return {
      effect: selectThenApplyInvalidateEffects(
        cardinality.cardinality.min,
        cardinality.cardinality.max,
        leaderOrCharacter.target.request.filter ?? {
          categories: ["leader", "character"],
        },
        combined.duration,
        {
          zones: ["leaderArea", "characterArea"],
          ...(combined.followupPowerModifier === undefined
            ? {}
            : { followupPowerModifier: combined.followupPowerModifier }),
          ...(combined.followupEffects === undefined
            ? {}
            : { followupEffects: combined.followupEffects }),
        },
      ),
      evidence: [
        "instruction:invalidateEffects",
        ...cardinality.evidence,
        "chooser:self:upTo",
        ...leaderOrCharacter.evidence,
        ...combined.evidence,
        "composition:selectThenApply",
      ],
      rest: "",
    };
  }

  const target = parseOpponentCharactersTarget({ text: cardinality.rest });
  if (target === undefined) {
    return undefined;
  }

  const combined = parseOptionalFollowupEffects(target.rest);
  if (combined === undefined) {
    return undefined;
  }

  return {
    effect: selectThenApplyInvalidateEffects(
      cardinality.cardinality.min,
      cardinality.cardinality.max,
      target.filter ?? { categories: ["character"] },
      combined.duration,
      {
        zones: ["characterArea"],
        ...(combined.followupEffects === undefined
          ? {}
          : { followupEffects: combined.followupEffects }),
      },
    ),
    evidence: [
      "instruction:invalidateEffects",
      ...cardinality.evidence,
      "chooser:self:upTo",
      ...target.evidence,
      ...combined.evidence,
      "composition:selectThenApply",
    ],
    rest: "",
  };
};

export function parseEntryPointEffectInvalidationInstruction(
  input: Parameters<InstructionParser>[0],
  options: {
    readonly defaultDuration?: Duration;
    readonly defaultDurationEvidence?: PrimitiveEvidence;
  } = {},
): InstructionParseResult | undefined {
  const match =
    /^(?<owner>Your|Your opponent's) (?<entryPoint>\[[^\]]+\]) effects are negated(?<duration>.*)$/iu.exec(
      input.text,
    );
  const owner = match?.groups?.["owner"];
  const entryPointText = match?.groups?.["entryPoint"];
  const rawDurationText = match?.groups?.["duration"]?.trim() ?? "";
  const durationText = rawDurationText === "." ? "" : rawDurationText;
  if (owner === undefined || entryPointText === undefined) {
    return undefined;
  }
  const entryPoint = supportedEntryPoints.find(
    (entry) => entry.text.toLowerCase() === entryPointText.toLowerCase(),
  );
  if (entryPoint === undefined) {
    return undefined;
  }
  const effectEntryPoint = toEffectEntryPointFilter(entryPoint.trigger.type);
  if (effectEntryPoint === undefined) {
    return undefined;
  }

  const duration =
    durationText.length === 0
      ? options.defaultDuration === undefined
        ? undefined
        : {
            duration: options.defaultDuration,
            evidence:
              options.defaultDurationEvidence === undefined
                ? []
                : [options.defaultDurationEvidence],
            rest: "",
          }
      : parseDurationFromSet(
          { text: durationText },
          fieldEffectDurationParsers,
        );
  if (duration?.duration === undefined || duration.rest.length > 0) {
    return undefined;
  }

  const player = owner.toLowerCase() === "your" ? "self" : "opponent";
  return {
    effect: {
      type: "invalidateEffectEntryPoint",
      player,
      effectEntryPoint,
      duration: duration.duration,
    },
    evidence: [
      "instruction:invalidateEffects",
      ...entryPoint.evidence.filter((evidence) =>
        evidence.startsWith("entry:"),
      ),
      `player:${player}`,
      ...duration.evidence,
    ],
    rest: "",
  };
}

function toEffectEntryPointFilter(
  type: string,
): EffectEntryPointFilter | undefined {
  if (type === "anyOf" || type === "eventCount") {
    return undefined;
  }
  return { type: type as EffectEntryPointFilter["type"] };
}

function parseOpponentLeaderAndAllCharactersInvalidateEffects(
  text: string,
): InstructionParseResult | undefined {
  const match =
    /^your opponent's Leader and all of (?:their|your opponent's) Characters?\s+(?<duration>.*)$/iu.exec(
      text,
    );
  const durationText = match?.groups?.["duration"];
  if (durationText === undefined) {
    return undefined;
  }
  const duration = parseDurationFromSet(
    { text: durationText },
    thisTurnOnlyDurationParsers,
  );
  if (duration?.duration === undefined || duration.rest.length > 0) {
    return undefined;
  }

  return {
    effect: {
      type: "sequence",
      effects: [
        {
          connector: "always",
          effect: {
            type: "invalidateEffects",
            target: opponentLeaderAllTarget(),
            duration: duration.duration,
          },
        },
        {
          connector: "always",
          effect: {
            type: "invalidateEffects",
            target: {
              type: "all",
              player: "opponent",
              zone: "characterArea",
              filter: { categories: ["character"] },
            },
            duration: duration.duration,
          },
        },
      ],
    },
    evidence: [
      "instruction:invalidateEffects",
      "target:opponentLeader",
      "player:opponent",
      "zone:leaderArea",
      "filter:category:leader",
      "cardinality:all",
      "target:opponentCharacters",
      "zone:characterArea",
      "filter:category:character",
      ...duration.evidence,
      "composition:sequence",
    ],
    rest: "",
  };
}

function opponentLeaderAllTarget(): Extract<Target, { type: "all" }> {
  return {
    type: "all",
    player: "opponent",
    zone: "leaderArea",
    filter: { categories: ["leader"] },
  };
}

function parseOpponentLeaderAndCharacterEachInvalidateEffects(
  text: string,
): InstructionParseResult | undefined {
  const match =
    /^up to 1 of each of your opponent's Leader and Character cards\s+(?<duration>.*)$/iu.exec(
      text,
    );
  const durationText = match?.groups?.["duration"];
  if (durationText === undefined) {
    return undefined;
  }
  const duration = parseDurationFromSet(
    { text: durationText },
    thisTurnOnlyDurationParsers,
  );
  if (duration?.duration === undefined || duration.rest.length > 0) {
    return undefined;
  }

  return {
    effect: {
      type: "sequence",
      effects: [
        {
          connector: "always",
          effect: selectThenApplyInvalidateEffects(
            0,
            1,
            { categories: ["leader"] },
            duration.duration,
            {
              zones: ["leaderArea"],
              selectionId: "selected:invalidate-effects-leader-target",
            },
          ),
        },
        {
          connector: "then",
          effect: selectThenApplyInvalidateEffects(
            0,
            1,
            { categories: ["character"] },
            duration.duration,
            {
              zones: ["characterArea"],
              selectionId: "selected:invalidate-effects-character-target",
            },
          ),
        },
      ],
    },
    evidence: [
      "instruction:invalidateEffects",
      "cardinality:upTo",
      "count:positiveInteger",
      "chooser:self:upTo",
      "target:opponentLeader",
      "player:opponent",
      "zone:leaderArea",
      "filter:category:leader",
      "target:opponentCharacters",
      "zone:characterArea",
      "filter:category:character",
      ...duration.evidence,
      "composition:selectThenApply",
      "composition:sequence",
    ],
    rest: "",
  };
}

function parseOpponentLeaderTarget(text: string):
  | {
      readonly evidence: readonly PrimitiveEvidence[];
      readonly filter: NonNullable<
        Extract<Target, { type: "choose" }>["request"]["filter"]
      >;
      readonly rest: string;
    }
  | undefined {
  const match = /^of your opponent's Leader(?!\s+or\b)\b\s*(?<rest>.*)$/iu.exec(
    text,
  );
  if (match === null) {
    return undefined;
  }
  return {
    evidence: [
      "target:opponentLeader",
      "player:opponent",
      "zone:leaderArea",
      "filter:category:leader",
    ],
    filter: { categories: ["leader"] },
    rest: match.groups?.["rest"]?.trim() ?? "",
  };
}

function selectThenApplyInvalidateEffects(
  min: number,
  max: number,
  filter: TargetFilter,
  duration: Extract<Effect, { type: "invalidateEffects" }>["duration"],
  options: {
    readonly zones: readonly [SavedFieldObjectZone, ...SavedFieldObjectZone[]];
    readonly followupEffects?: readonly Effect[];
    readonly followupPowerModifier?: number;
    readonly selectionId?: string;
  },
): Effect {
  const selectionId = options.selectionId ?? invalidateEffectsTargetSelectionId;
  const zoneOptions =
    options.zones.length === 1
      ? { zone: options.zones[0] }
      : { zones: options.zones };

  return selectThenApplyFieldTarget({
    selectionId,
    selectId: `select:invalidate-effects-target:${selectionId}`,
    player: "opponent",
    ...zoneOptions,
    filter,
    min,
    max,
    apply: (target) => ({
      type: "invalidateEffects",
      target,
      duration,
    }),
    then: (target) => [
      ...(options.followupEffects ?? []),
      ...(options.followupPowerModifier === undefined
        ? []
        : [
            {
              type: "modifyPower",
              target,
              value: options.followupPowerModifier,
              duration,
            } as const,
          ]),
    ],
  });
}

function selectedInvalidateEffectsTarget(
  zones: readonly [SavedFieldObjectZone, ...SavedFieldObjectZone[]],
  selectionId = invalidateEffectsTargetSelectionId,
): Target {
  return savedFieldObjectTarget({
    selectionId,
    player: "opponent",
    ...(zones.length === 1 ? { zone: zones[0] } : { zones }),
  });
}

function parseOptionalThatCardPowerModifier(text: string):
  | {
      readonly duration: Extract<
        Effect,
        { type: "invalidateEffects" }
      >["duration"];
      readonly evidence: readonly PrimitiveEvidence[];
      readonly powerModifier?: number;
    }
  | undefined {
  const directDuration = parseDurationFromSet(
    { text },
    thisTurnOnlyDurationParsers,
  );
  if (
    directDuration?.duration !== undefined &&
    directDuration.rest.length === 0
  ) {
    return {
      duration: directDuration.duration,
      evidence: directDuration.evidence,
    };
  }

  const modifierMatch = /^and give that card\s+(?<modifier>.+)$/iu.exec(text);
  const modifierText = modifierMatch?.groups?.["modifier"];
  if (modifierText === undefined) {
    return undefined;
  }
  const modifier = parseNegativePowerModifier({ text: modifierText });
  if (modifier === undefined) {
    return undefined;
  }
  const duration = parseDurationFromSet(
    { text: modifier.rest },
    thisTurnOnlyDurationParsers,
  );
  if (duration?.duration === undefined || duration.rest.length > 0) {
    return undefined;
  }
  return {
    duration: duration.duration,
    evidence: [
      "instruction:modifyPower",
      ...modifier.evidence,
      ...duration.evidence,
    ],
    powerModifier: modifier.value,
  };
}

function parseOptionalFollowupEffects(text: string):
  | {
      readonly duration: Extract<
        Effect,
        { type: "invalidateEffects" }
      >["duration"];
      readonly evidence: readonly PrimitiveEvidence[];
      readonly followupEffects?: readonly Effect[];
      readonly followupPowerModifier?: number;
    }
  | undefined {
  const savedTargetKo = parseThatCharacterCostConditionalKo(text);
  if (savedTargetKo !== undefined) {
    return savedTargetKo;
  }

  const powerModifier = parseOptionalThatCardPowerModifier(text);
  if (powerModifier !== undefined) {
    return {
      duration: powerModifier.duration,
      evidence: powerModifier.evidence,
      ...(powerModifier.powerModifier === undefined
        ? {}
        : { followupPowerModifier: powerModifier.powerModifier }),
    };
  }

  const cannotAttackMatch =
    /^and that Character cannot attack\s+(?<duration>.*)$/iu.exec(text);
  const cannotAttackDurationText = cannotAttackMatch?.groups?.["duration"];
  if (cannotAttackDurationText === undefined) {
    return undefined;
  }
  const duration = parseDurationFromSet(
    { text: cannotAttackDurationText },
    attackRestrictionDurationParsers,
  );
  if (
    duration === undefined ||
    duration.duration === undefined ||
    duration.rest.length > 0
  ) {
    return undefined;
  }
  return {
    duration: duration.duration,
    evidence: [
      "instruction:preventActivation",
      "reference:thatCharacter",
      "target:thatCharacter",
      ...duration.evidence,
    ],
    followupEffects: [
      {
        type: "cannotAttack",
        target: selectedInvalidateEffectsTarget(["characterArea"]),
        duration: duration.duration,
      },
    ],
  };
}

function parseThatCharacterCostConditionalKo(text: string):
  | {
      readonly duration: Extract<
        Effect,
        { type: "invalidateEffects" }
      >["duration"];
      readonly evidence: readonly PrimitiveEvidence[];
      readonly followupEffects: readonly Effect[];
    }
  | undefined {
  const match =
    /^(?<duration>.+?)\.\s+Then,\s+if that Character has (?:(?:a )?cost of (?<cost>[1-9]\d*)|(?<power>[1-9]\d*) power) (?<comparison>or less|or more),\s*K\.O\. it\.?$/iu.exec(
      text,
    );
  const durationText = match?.groups?.["duration"];
  const costText = match?.groups?.["cost"];
  const powerText = match?.groups?.["power"];
  const valueText = costText ?? powerText;
  const comparisonText = match?.groups?.["comparison"];
  if (
    durationText === undefined ||
    valueText === undefined ||
    comparisonText === undefined
  ) {
    return undefined;
  }

  const duration = parseDurationFromSet(
    { text: durationText },
    thisTurnOnlyDurationParsers,
  );
  if (duration?.duration === undefined || duration.rest.length > 0) {
    return undefined;
  }

  const target = selectedInvalidateEffectsTarget(["characterArea"]);
  const op = comparisonText.toLowerCase() === "or less" ? "lte" : "gte";
  const stat = powerText === undefined ? "cost" : "currentPower";
  return {
    duration: duration.duration,
    evidence: [
      ...duration.evidence,
      "condition:cardStatComparison",
      stat === "cost" ? "condition:stat:cost" : "condition:stat:currentPower",
      op === "lte" ? "condition:comparator:lte" : "condition:comparator:gte",
      "condition:threshold:positiveInteger",
      "composition:savedTargetCondition",
      "instruction:ko",
    ],
    followupEffects: [
      {
        type: "conditional",
        if: {
          type: "cardStatComparison",
          target,
          stat,
          op,
          value: Number.parseInt(valueText, 10),
        },
        then: {
          type: "ko",
          target,
        },
      },
    ],
  };
}

type TargetFilter = NonNullable<
  Extract<Target, { type: "choose" }>["request"]["filter"]
>;
type InstructionParseResult = ReturnType<InstructionParser>;
