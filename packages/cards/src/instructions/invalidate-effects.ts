import type { Effect, Target } from "@optcg/types";

import { parseUpToCardinality } from "../cardinality/index.js";
import { parseThisTurnDuration } from "../durations/index.js";
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
    "target:opponentCharacters",
    "duration:thisTurn",
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

  const actionMatch = /^Negate the effect of\s+(?<rest>.*)$/i.exec(input.text);
  const actionRest = actionMatch?.groups?.["rest"];
  if (actionRest === undefined) {
    return undefined;
  }

  const cardinality = parseUpToCardinality({ text: actionRest });
  if (cardinality === undefined) {
    return undefined;
  }

  const leaderOrCharacter = parseOpponentLeaderOrCharacterCardsTarget({
    text: cardinality.rest,
  });
  if (leaderOrCharacter?.target?.type === "chooseFromZones") {
    const combined = parseOptionalThatCardPowerModifier(leaderOrCharacter.rest);
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
          ...(combined.powerModifier === undefined
            ? {}
            : { followupPowerModifier: combined.powerModifier }),
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

  const duration = parseThisTurnDuration({ text: target.rest });
  if (duration?.duration === undefined) {
    return undefined;
  }

  return {
    effect: selectThenApplyInvalidateEffects(
      cardinality.cardinality.min,
      cardinality.cardinality.max,
      target.filter ?? { categories: ["character"] },
      duration.duration,
      { zones: ["characterArea"] },
    ),
    evidence: [
      "instruction:invalidateEffects",
      ...cardinality.evidence,
      "chooser:self:upTo",
      ...target.evidence,
      ...duration.evidence,
      "composition:selectThenApply",
    ],
    rest: "",
  };
};

function selectThenApplyInvalidateEffects(
  min: number,
  max: number,
  filter: TargetFilter,
  duration: Extract<Effect, { type: "invalidateEffects" }>["duration"],
  options: {
    readonly zones:
      | readonly ["characterArea"]
      | readonly ["leaderArea", "characterArea"];
    readonly followupPowerModifier?: number;
  },
): Effect {
  const savedTarget = selectedInvalidateEffectsTarget(options.zones);
  const effects: Extract<Effect, { type: "sequence" }>["effects"] = [
    {
      id: "select:invalidate-effects-target",
      connector: "always",
      saveResultAs: invalidateEffectsTargetSelectionId,
      effect: {
        type: "selectTargets",
        request:
          options.zones.length === 1
            ? {
                timing: "onResolution",
                chooser: "self",
                player: "opponent",
                zone: "characterArea",
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
  zones: readonly ["characterArea"] | readonly ["leaderArea", "characterArea"],
): Target {
  return {
    type: "savedFieldObject",
    binding: {
      family: "selectedTargets",
      saveResultAs: invalidateEffectsTargetSelectionId,
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
  const directDuration = parseThisTurnDuration({ text });
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
  const duration = parseThisTurnDuration({ text: modifier.rest });
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

type TargetFilter = NonNullable<
  Extract<Target, { type: "choose" }>["request"]["filter"]
>;
