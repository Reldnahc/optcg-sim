import type { Effect, SavedFieldObjectZone, Target } from "@optcg/types";

import { parseUpToCardinality } from "../cardinality/index.js";
import {
  attackRestrictionDurationParsers,
  parseDurationFromSet,
  thisTurnOnlyDurationParsers,
} from "../durations/index.js";
import { parseNegativePowerModifier } from "../modifiers/index.js";
import {
  parseOpponentCharactersTarget,
  parseOpponentLeaderOrCharacterCardsTarget,
} from "../targets/index.js";
import type { InstructionParser, PrimitiveEvidence } from "../types.js";

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
  const savedTarget = selectedInvalidateEffectsTarget(
    options.zones,
    selectionId,
  );
  const effects: Extract<Effect, { type: "sequence" }>["effects"] = [
    {
      id: `select:invalidate-effects-target:${selectionId}`,
      connector: "always",
      saveResultAs: selectionId,
      effect: {
        type: "selectTargets",
        request:
          options.zones.length === 1
            ? {
                timing: "onResolution",
                chooser: "self",
                player: "opponent",
                zone: options.zones[0],
                min,
                max,
                allowFewerIfUnavailable: true,
                visibility: "public",
                filter,
              }
            : {
                timing: "onResolution",
                chooser: "self",
                player: "opponent",
                zones: ["leaderArea", "characterArea"],
                min,
                max,
                allowFewerIfUnavailable: true,
                visibility: "public",
                filter,
              },
      },
    },
    {
      connector: "then",
      effect: {
        type: "invalidateEffects",
        target: savedTarget,
        duration,
      },
    },
  ];

  for (const followup of options.followupEffects ?? []) {
    effects.push({
      connector: "then",
      effect: followup,
    });
  }

  if (options.followupPowerModifier !== undefined) {
    effects.push({
      connector: "then",
      effect: {
        type: "modifyPower",
        target: savedTarget,
        value: options.followupPowerModifier,
        duration,
      },
    });
  }

  return {
    type: "sequence",
    effects,
  };
}

function selectedInvalidateEffectsTarget(
  zones: readonly [SavedFieldObjectZone, ...SavedFieldObjectZone[]],
  selectionId = invalidateEffectsTargetSelectionId,
): Target {
  return {
    type: "savedFieldObject",
    binding: {
      family: "selectedTargets",
      saveResultAs: selectionId,
    },
    ...(zones.length === 1 ? { zone: zones[0] } : { zones }),
    player: "opponent",
    visibility: "publicOnly",
    onFailure: "failClosed",
  };
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
    /^(?<duration>.+?)\.\s+Then,\s+if that Character has a cost of (?<value>[1-9]\d*) (?<comparison>or less|or more),\s*K\.O\. it\.?$/iu.exec(
      text,
    );
  const durationText = match?.groups?.["duration"];
  const valueText = match?.groups?.["value"];
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
  return {
    duration: duration.duration,
    evidence: [
      ...duration.evidence,
      "condition:cardStatComparison",
      "condition:stat:cost",
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
          stat: "cost",
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
