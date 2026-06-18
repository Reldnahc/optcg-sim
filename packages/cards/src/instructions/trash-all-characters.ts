import { parseUpToCardinality } from "../cardinality/index.js";
import type { InstructionParseResult, InstructionParser } from "../types.js";
import {
  fieldZoneForCategory,
  selectThenApplyFieldTarget,
} from "./effect-builders.js";
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
  const zone = fieldZoneForCategory(category) ?? "characterArea";

  return {
    effect: selectThenApplyFieldTarget({
      selectionId: trashTargetSelectionId,
      selectId: "select:trash-target",
      player: "opponent",
      zone,
      min: cardinality.cardinality.min,
      max: cardinality.cardinality.max,
      filter: selectedTarget.filter ?? { categories: ["character"] },
      apply: (target) => ({ type: "trash", target }),
    }),
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
