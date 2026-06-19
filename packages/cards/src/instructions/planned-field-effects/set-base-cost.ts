import { parseUpToCardinality } from "../../cardinality/index.js";
import {
  parseDurationFromSet,
  thisTurnOnlyDurationParsers,
} from "../../durations/index.js";
import { parseOpponentCharactersTarget } from "../../targets/index.js";
import type { InstructionParser } from "../../types.js";
import { selectThenApplyFieldTarget } from "../effect-builders.js";

const baseCostSelectionId = "selected:base-cost-target";

export const parseSetBaseCostInstruction: InstructionParser = (input) => {
  const match = /^set the cost of (?<targetText>.+)$/iu.exec(input.text);
  const targetText = match?.groups?.["targetText"]?.trim();
  if (targetText === undefined) {
    return undefined;
  }

  const cardinality = parseUpToCardinality({ text: targetText });
  if (cardinality === undefined) {
    return undefined;
  }

  const target = parseOpponentCharactersTarget({ text: cardinality.rest });
  if (target === undefined) {
    return undefined;
  }

  const costMatch = /^to (?<value>\d+)\s+(?<duration>.+)$/iu.exec(target.rest);
  const valueText = costMatch?.groups?.["value"];
  const durationText = costMatch?.groups?.["duration"]?.trim();
  if (valueText === undefined || durationText === undefined) {
    return undefined;
  }

  const duration = parseDurationFromSet(
    { text: durationText },
    thisTurnOnlyDurationParsers,
  );
  if (
    duration === undefined ||
    duration.duration === undefined ||
    duration.rest.length > 0
  ) {
    return undefined;
  }
  const parsedDuration = duration.duration;

  const value = Number.parseInt(valueText, 10);
  if (!Number.isSafeInteger(value) || value < 0) {
    return undefined;
  }

  return {
    effect: selectThenApplyFieldTarget({
      selectionId: baseCostSelectionId,
      selectId: "select:base-cost-target",
      player: "opponent",
      zone: "characterArea",
      filter: target.filter ?? { categories: ["character"] },
      min: cardinality.cardinality.min,
      max: cardinality.cardinality.max,
      apply: (target) => ({
        type: "setBaseCost",
        target,
        value,
        duration: parsedDuration,
      }),
    }),
    evidence: [
      "instruction:setBaseCost",
      ...cardinality.evidence,
      "chooser:self:upTo",
      ...target.evidence,
      ...duration.evidence,
      "composition:selectThenApply",
    ],
    rest: "",
  };
};
