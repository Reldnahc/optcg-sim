import { parseUpToCardinality } from "../../cardinality/index.js";
import {
  parseDurationFromSet,
  thisTurnOnlyDurationParsers,
} from "../../durations/index.js";
import { parseOpponentCharactersTarget } from "../../targets/index.js";
import type { InstructionParser } from "../../types.js";
import { selectThenApplyFieldTarget } from "../effect-builders.js";

const powerZeroSelectionId = "selected:power-zero-target";

export const parseSetPowerToZeroInstruction: InstructionParser = (input) => {
  const match = /^set the power of (?<targetText>.+)$/iu.exec(input.text);
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

  const zeroMatch = /^to 0\s+(?<duration>.+)$/iu.exec(target.rest);
  const durationText = zeroMatch?.groups?.["duration"]?.trim();
  if (durationText === undefined) {
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

  return {
    effect: selectThenApplyFieldTarget({
      selectionId: powerZeroSelectionId,
      selectId: "select:power-zero-target",
      player: "opponent",
      zone: "characterArea",
      filter: target.filter ?? { categories: ["character"] },
      min: cardinality.cardinality.min,
      max: cardinality.cardinality.max,
      apply: (target) => ({
        type: "setPowerToZero",
        target,
        duration: parsedDuration,
      }),
    }),
    evidence: [
      "instruction:setPowerToZero",
      ...cardinality.evidence,
      "chooser:self:upTo",
      ...target.evidence,
      ...duration.evidence,
      "composition:selectThenApply",
    ],
    rest: "",
  };
};
