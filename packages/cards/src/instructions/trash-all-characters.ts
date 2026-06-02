import type { Effect, Target } from "@optcg/types";

import { parseUpToCardinality } from "../cardinality/index.js";
import type { InstructionParseResult, InstructionParser } from "../types.js";
import {
  parseAllFieldTarget,
  parseOpponentFieldTarget,
} from "../targets/index.js";

const trashTargetSelectionId = "selected:trash-target";

export const parseTrashInstruction: InstructionParser = (input) => {
  const actionMatch = /^Trash\s+(?<target>.+)$/i.exec(input.text);
  const targetText = actionMatch?.groups?.["target"];
  if (targetText === undefined) {
    return undefined;
  }

  const normalizedTargetText = targetText.replace(/\.$/, "");
  const target = parseAllFieldTarget({ text: normalizedTargetText });
  if (target !== undefined && target.rest.length === 0) {
    return {
      effect: {
        type: "trash",
        target: target.target,
      },
      evidence: ["instruction:trash", ...target.evidence],
      rest: "",
    } satisfies InstructionParseResult;
  }

  const cardinality = parseUpToCardinality({ text: normalizedTargetText });
  if (cardinality === undefined) {
    return undefined;
  }

  const selectedTarget = parseOpponentFieldTarget({ text: cardinality.rest });
  if (selectedTarget === undefined || selectedTarget.rest.length > 0) {
    return undefined;
  }
  const category = selectedTarget.filter?.categories?.[0];
  const zone = category === "stage" ? "stageArea" : "characterArea";

  return {
    effect: selectThenApplyTrashEffect(
      cardinality.cardinality.min,
      cardinality.cardinality.max,
      selectedTarget.filter ?? { categories: ["character"] },
      zone,
    ),
    evidence: [
      "instruction:trash",
      ...cardinality.evidence,
      "chooser:self:upTo",
      ...selectedTarget.evidence,
      "composition:selectThenApply",
    ],
    rest: "",
  } satisfies InstructionParseResult;
};

export const parseTrashAllYourCharactersInstruction = parseTrashInstruction;

function selectThenApplyTrashEffect(
  min: number,
  max: number,
  filter: TargetFilter,
  zone: "characterArea" | "stageArea",
): Effect {
  return {
    type: "sequence",
    effects: [
      {
        id: "select:trash-target",
        connector: "always",
        saveResultAs: trashTargetSelectionId,
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
          type: "trash",
          target: selectedTrashTarget(zone),
        },
      },
    ],
  };
}

function selectedTrashTarget(zone: "characterArea" | "stageArea"): Target {
  return {
    type: "savedFieldObject",
    binding: {
      family: "selectedTargets",
      saveResultAs: trashTargetSelectionId,
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
