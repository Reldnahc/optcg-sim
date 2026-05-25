import type { Effect, Target } from "@optcg/types";

import { parseUpToCardinality } from "../cardinality/index.js";
import { parseOpponentCharactersTarget } from "../targets/index.js";
import type { InstructionParser } from "../types.js";

const koTargetSelectionId = "selected:ko-target";

const selectedKoTarget = {
  type: "savedFieldObject",
  binding: {
    family: "selectedTargets",
    saveResultAs: koTargetSelectionId,
  },
  zone: "characterArea",
  player: "opponent",
  visibility: "publicOnly",
  onFailure: "failClosed",
} as const satisfies Target;

export const koInstructionPrimitive = {
  primitiveId: "instruction:ko",
  childPrimitiveIds: [
    "cardinality:upTo",
    "target:opponentCharacters",
    "composition:selectThenApply",
  ],
} as const;

export const parseKoInstruction: InstructionParser = (input) => {
  const actionMatch = /^K\.O\.\s+(?<rest>.*)$/i.exec(input.text);
  const actionRest = actionMatch?.groups?.["rest"];
  if (actionRest === undefined) {
    return undefined;
  }

  const cardinality = parseUpToCardinality({ text: actionRest });
  if (cardinality === undefined) {
    return undefined;
  }

  const target = parseOpponentCharactersTarget({ text: cardinality.rest });
  if (target === undefined || (target.rest.length > 0 && target.rest !== ".")) {
    return undefined;
  }

  return {
    effect: selectThenApplyKoEffect(
      cardinality.cardinality.min,
      cardinality.cardinality.max,
      target.filter ?? { categories: ["character"] },
    ),
    evidence: [
      "instruction:ko",
      ...cardinality.evidence,
      "chooser:self:upTo",
      ...target.evidence,
      "composition:selectThenApply",
    ],
    rest: "",
  };
};

function selectThenApplyKoEffect(
  min: number,
  max: number,
  filter: TargetFilter,
): Effect {
  return {
    type: "sequence",
    effects: [
      {
        id: "select:ko-target",
        connector: "always",
        saveResultAs: koTargetSelectionId,
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
          type: "ko",
          target: selectedKoTarget,
        },
      },
    ],
  };
}

type TargetFilter = NonNullable<
  Extract<Target, { type: "choose" }>["request"]["filter"]
>;
