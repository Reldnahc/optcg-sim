import { parseUpToCardinality } from "../../cardinality/index.js";
import {
  directPowerGainTargetParsers,
  parseAllFieldTarget,
  parseTargetFromSet,
  selectedPowerGainTargetParsers,
} from "../../targets/index.js";
import type { InstructionParser } from "../../types.js";
import { parsePaidCostCardCountPower } from "./dynamic-paid-cost.js";
import { parseThisCharacterRevealedCostPower } from "./dynamic-revealed-cost.js";
import { parseGainsPositivePower, withCardinality } from "./shared.js";

export const parsePowerGainInstruction: InstructionParser = (input) => {
  const paidCostCardCountPower = parsePaidCostCardCountPower(input);
  if (paidCostCardCountPower !== undefined) {
    return paidCostCardCountPower;
  }

  const dynamicRevealedCostPower = parseThisCharacterRevealedCostPower(input);
  if (dynamicRevealedCostPower !== undefined) {
    return dynamicRevealedCostPower;
  }

  const allTarget = parseAllFieldTarget(input);
  if (allTarget !== undefined) {
    const parsed = parseGainsPositivePower(allTarget.target, allTarget.rest);
    if (parsed !== undefined) {
      return {
        effect: parsed.effect,
        evidence: [
          "instruction:modifyPower",
          ...allTarget.evidence,
          ...parsed.evidence,
        ],
        rest: "",
      };
    }
  }

  const cardinality = parseUpToCardinality(input);
  if (cardinality !== undefined) {
    const target = parseTargetFromSet(
      { text: cardinality.rest },
      selectedPowerGainTargetParsers(),
    );
    if (target?.target !== undefined) {
      const parsed = parseGainsPositivePower(
        withCardinality(target.target, cardinality.cardinality),
        target.rest,
      );
      if (parsed !== undefined) {
        return {
          effect: parsed.effect,
          evidence: [
            "instruction:modifyPower",
            ...cardinality.evidence,
            "chooser:self:upTo",
            ...target.evidence,
            ...parsed.evidence,
          ],
          rest: "",
        };
      }
    }
  }

  const directTarget = parseTargetFromSet(
    input,
    directPowerGainTargetParsers(),
  );
  if (directTarget?.target === undefined) {
    return undefined;
  }

  const parsed = parseGainsPositivePower(
    directTarget.target,
    directTarget.rest,
  );
  if (parsed === undefined) {
    return undefined;
  }

  return {
    effect: parsed.effect,
    evidence: [
      "instruction:modifyPower",
      ...directTarget.evidence,
      ...parsed.evidence,
    ],
    rest: "",
  };
};
