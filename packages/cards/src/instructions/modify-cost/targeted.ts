import { parseUpToCardinality } from "../../cardinality/index.js";
import {
  attackRestrictionDurationParsers,
  parseDurationFromSet,
} from "../../durations/index.js";
import {
  parseTargetFromSet,
  yourFieldEffectTargetParsers,
} from "../../targets/index.js";
import type { InstructionParser } from "../../types.js";
import { parsePositiveCostModifier } from "./shared.js";

export const parseTargetedModifyCostInstruction: InstructionParser = (
  input,
) => {
  const cardinality = parseUpToCardinality(input);
  if (cardinality === undefined) {
    return undefined;
  }

  const target = parseTargetFromSet(
    { text: cardinality.rest },
    yourFieldEffectTargetParsers(cardinality.cardinality),
  );
  if (target?.target === undefined) return undefined;

  const modifierText = /^gains\s+(?<rest>.*)$/i.exec(target.rest)?.groups?.[
    "rest"
  ];
  if (modifierText === undefined) {
    return undefined;
  }

  const modifier = parsePositiveCostModifier({ text: modifierText });
  if (modifier === undefined) {
    return undefined;
  }

  const duration = parseDurationFromSet(
    { text: modifier.rest },
    attackRestrictionDurationParsers,
  );
  if (duration?.duration === undefined || duration.rest.length > 0) {
    return undefined;
  }

  return {
    effect: {
      type: "modifyCost",
      player: "self",
      target: target.target,
      value: modifier.value,
      duration: duration.duration,
    },
    evidence: [
      "instruction:modifyCost",
      ...cardinality.evidence,
      "chooser:self:upTo",
      ...target.evidence,
      ...modifier.evidence,
      ...duration.evidence,
    ],
    rest: "",
  };
};
