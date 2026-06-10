import { parseUpToCardinality } from "../../cardinality/index.js";
import {
  parseAllFieldTarget,
  parseOpponentCharactersTarget,
} from "../../targets/index.js";
import type { InstructionParser } from "../../types.js";
import type { ContinuousInstructionParser } from "../continuous-field-effects.js";
import {
  parseCostModifierDuration,
  parseNegativeCostModifier,
  parsePositiveCostModifier,
} from "./shared.js";

export const parseContinuousFieldModifyCostInstruction: ContinuousInstructionParser =
  (input, context) =>
    parseFieldCostReductionInstruction(input, {
      condition: context.condition,
      requireExplicitDuration: false,
    });

export function parseFieldCostReductionInstruction(
  input: { readonly text: string },
  options: Parameters<typeof parseCostModifierDuration>[1],
): ReturnType<InstructionParser> {
  const allFieldGain = parseAllFieldCostModifierInstruction(input.text, {
    options,
    requireGainVerb: true,
  });
  if (allFieldGain !== undefined) {
    return allFieldGain;
  }

  const actionRest = /^give\s+(?<rest>.*)$/i.exec(input.text)?.groups?.["rest"];
  if (actionRest === undefined) {
    return undefined;
  }

  const allFieldModifier = parseAllFieldCostModifierInstruction(actionRest, {
    options,
    requireGainVerb: false,
  });
  if (allFieldModifier !== undefined) {
    return allFieldModifier;
  }

  const cardinality = parseUpToCardinality({ text: actionRest });
  if (cardinality === undefined) {
    return undefined;
  }

  const target = parseOpponentCharactersTarget({ text: cardinality.rest });
  if (target === undefined) {
    return undefined;
  }

  const modifier = parseNegativeCostModifier({ text: target.rest });
  if (modifier === undefined) {
    return undefined;
  }
  const duration = parseCostModifierDuration(modifier.rest, options);
  if (duration === undefined) {
    return undefined;
  }

  return {
    effect: {
      type: "modifyCost",
      player: "self",
      target: {
        type: "choose",
        request: {
          timing: "onResolution",
          chooser: "self",
          player: "opponent",
          zone: "characterArea",
          min: cardinality.cardinality.min,
          max: cardinality.cardinality.max,
          allowFewerIfUnavailable: true,
          visibility: "public",
          filter: target.filter ?? { categories: ["character"] },
        },
      },
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
}

function parseAllFieldCostModifierInstruction(
  text: string,
  {
    options,
    requireGainVerb,
  }: {
    readonly options: Parameters<typeof parseCostModifierDuration>[1];
    readonly requireGainVerb: boolean;
  },
): ReturnType<InstructionParser> {
  const allTarget = parseAllFieldTarget({ text });
  if (allTarget === undefined) {
    return undefined;
  }

  const modifierText = requireGainVerb
    ? /^gains?\s+(?<rest>.*)$/iu.exec(allTarget.rest)?.groups?.["rest"]
    : (/^gains?\s+(?<rest>.*)$/iu.exec(allTarget.rest)?.groups?.["rest"] ??
      allTarget.rest);
  if (modifierText === undefined) {
    return undefined;
  }

  const modifier =
    parsePositiveCostModifier({ text: modifierText }) ??
    parseNegativeCostModifier({ text: modifierText });
  if (modifier === undefined) {
    return undefined;
  }
  const duration = parseCostModifierDuration(modifier.rest, options);
  if (duration === undefined) {
    return undefined;
  }

  return {
    effect: {
      type: "modifyCost",
      player: "self",
      target: allTarget.target,
      value: modifier.value,
      duration: duration.duration,
    },
    evidence: [
      "instruction:modifyCost",
      ...allTarget.evidence,
      ...modifier.evidence,
      ...duration.evidence,
    ],
    rest: "",
  };
}
