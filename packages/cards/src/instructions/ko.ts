import type { Effect, Target } from "@optcg/types";

import { parseUpToCardinality } from "../cardinality/index.js";
import {
  parseAllFieldTarget,
  parseOpponentFieldTarget,
} from "../targets/index.js";
import type { InstructionParser } from "../types.js";

const koTargetSelectionId = "selected:ko-target";

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

  const allTarget = parseAllFieldTarget({ text: actionRest });
  if (
    allTarget !== undefined &&
    (allTarget.rest.length === 0 || allTarget.rest === ".")
  ) {
    return {
      effect: { type: "ko", target: allTarget.target },
      evidence: ["instruction:ko", ...allTarget.evidence],
      rest: "",
    };
  }

  const cardinality = parseUpToCardinality({ text: actionRest });
  if (cardinality === undefined) {
    return undefined;
  }

  const target = parseOpponentFieldTarget({ text: cardinality.rest });
  if (target === undefined || (target.rest.length > 0 && target.rest !== ".")) {
    return undefined;
  }
  const category = target.filter?.categories?.[0];
  const zone = category === "stage" ? "stageArea" : "characterArea";

  return {
    effect: selectThenApplyKoEffect(
      cardinality.cardinality.min,
      cardinality.cardinality.max,
      target.filter ?? { categories: ["character"] },
      zone,
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
  zone: "characterArea" | "stageArea",
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
            zone,
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
          target: selectedKoTarget(zone),
        },
      },
    ],
  };
}

function selectedKoTarget(zone: "characterArea" | "stageArea"): Target {
  return {
    type: "savedFieldObject",
    binding: {
      family: "selectedTargets",
      saveResultAs: koTargetSelectionId,
    },
    zone,
    player: "opponent",
    visibility: "publicOnly",
    onFailure: "failClosed",
  };
}

type TargetFilter = NonNullable<
  Extract<Target, { type: "choose" }>["request"]["filter"]
>;
