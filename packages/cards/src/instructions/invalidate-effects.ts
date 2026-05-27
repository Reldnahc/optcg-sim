import type { Effect, Target } from "@optcg/types";

import { parseUpToCardinality } from "../cardinality/index.js";
import { parseThisTurnDuration } from "../durations/index.js";
import { parseOpponentCharactersTarget } from "../targets/index.js";
import type { InstructionParser } from "../types.js";

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
  const actionMatch = /^Negate the effect of\s+(?<rest>.*)$/i.exec(input.text);
  const actionRest = actionMatch?.groups?.["rest"];
  if (actionRest === undefined) {
    return undefined;
  }

  const cardinality = parseUpToCardinality({ text: actionRest });
  if (cardinality === undefined) {
    return undefined;
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
): Effect {
  return {
    type: "sequence",
    effects: [
      {
        id: "select:invalidate-effects-target",
        connector: "always",
        saveResultAs: invalidateEffectsTargetSelectionId,
        effect: {
          type: "selectTargets",
          request: {
            timing: "onResolution",
            chooser: "self",
            player: "opponent",
            zone: "characterArea",
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
          target: selectedInvalidateEffectsTarget(),
          duration,
        },
      },
    ],
  };
}

function selectedInvalidateEffectsTarget(): Target {
  return {
    type: "savedFieldObject",
    binding: {
      family: "selectedTargets",
      saveResultAs: invalidateEffectsTargetSelectionId,
    },
    zone: "characterArea",
    player: "opponent",
    visibility: "publicOnly",
    onFailure: "failClosed",
  };
}

type TargetFilter = NonNullable<
  Extract<Target, { type: "choose" }>["request"]["filter"]
>;
