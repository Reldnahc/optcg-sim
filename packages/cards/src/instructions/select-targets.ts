import type { Target } from "@optcg/types";

import { parseUpToCardinality } from "../cardinality/index.js";
import { chosenCharacterSelectionId } from "../targets/chosen-character.js";
import { parseOpponentFieldTarget } from "../targets/index.js";
import type { InstructionParser } from "../types.js";

const selectedTarget = (
  zone: "characterArea" | "stageArea",
  player: "opponent",
  selectionId: string,
): Target => ({
  type: "savedFieldObject",
  binding: {
    family: "selectedTargets",
    saveResultAs: selectionId,
  },
  zone,
  player,
  visibility: "publicOnly",
  onFailure: "failClosed",
});

export const parseSelectTargetsInstruction: InstructionParser = (input) => {
  const match = /^Select\s+(?<target>.+)$/iu.exec(input.text);
  const targetText = match?.groups?.["target"];
  if (targetText === undefined) {
    return undefined;
  }

  const cardinality = parseUpToCardinality({ text: targetText });
  if (cardinality === undefined) {
    return undefined;
  }
  const target = parseOpponentFieldTarget({ text: cardinality.rest });
  if (target === undefined || (target.rest.length > 0 && target.rest !== ".")) {
    return undefined;
  }

  const category = target.filter?.categories?.[0];
  if (category !== "character" && category !== "stage") {
    return undefined;
  }
  const zone = category === "stage" ? "stageArea" : "characterArea";

  return {
    effect: {
      type: "selectTargets",
      request: {
        timing: "onResolution",
        chooser: "self",
        player: "opponent",
        zone,
        min: cardinality.cardinality.min,
        max: cardinality.cardinality.max,
        allowFewerIfUnavailable: true,
        visibility: "public",
        filter: target.filter ?? { categories: [category] },
      },
    },
    saveResultAs: chosenCharacterSelectionId,
    evidence: [
      "instruction:selectTargets",
      ...cardinality.evidence,
      "chooser:self:upTo",
      ...target.evidence,
    ],
    rest: "",
  };
};

export { selectedTarget };
