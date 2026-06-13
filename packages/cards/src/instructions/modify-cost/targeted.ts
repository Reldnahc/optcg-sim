import type { Target } from "@optcg/types";

import { parseUpToCardinality } from "../../cardinality/index.js";
import {
  attackRestrictionDurationParsers,
  parseDurationFromSet,
} from "../../durations/index.js";
import {
  parseThisCharacterTarget,
  parseTargetFromSet,
  yourFieldEffectTargetParsers,
} from "../../targets/index.js";
import type { InstructionParser } from "../../types.js";
import { parsePositiveCostModifier } from "./shared.js";

export const parseTargetedModifyCostInstruction: InstructionParser = (
  input,
) => {
  const directTarget = parseThisCharacterTarget({
    text: input.text,
    allowImplicit: true,
  });
  if (directTarget !== undefined) {
    const parsed = parseCostGainForTarget(
      directTarget.target,
      directTarget.rest,
    );
    if (parsed !== undefined) {
      return {
        effect: parsed.effect,
        evidence: [
          "instruction:modifyCost",
          ...directTarget.evidence,
          ...parsed.evidence,
        ],
        rest: "",
      };
    }
  }

  const cardinality = parseUpToCardinality(input);
  if (cardinality === undefined) {
    return undefined;
  }

  const target = parseTargetFromSet(
    { text: cardinality.rest },
    yourFieldEffectTargetParsers(cardinality.cardinality),
  );
  if (target?.target === undefined) return undefined;

  const parsed = parseCostGainForTarget(target.target, target.rest);
  if (parsed === undefined) {
    return undefined;
  }

  return {
    effect: parsed.effect,
    evidence: [
      "instruction:modifyCost",
      ...cardinality.evidence,
      "chooser:self:upTo",
      ...target.evidence,
      ...parsed.evidence,
    ],
    rest: "",
  };
};

function parseCostGainForTarget(
  target: Target,
  rest: string,
): ReturnType<InstructionParser> {
  const modifierText = /^gains\s+(?<rest>.*)$/i.exec(rest)?.groups?.["rest"];
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
      target,
      value: modifier.value,
      duration: duration.duration,
    },
    evidence: [...modifier.evidence, ...duration.evidence],
    rest: "",
  };
}
