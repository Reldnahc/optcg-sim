import type { Cardinality, Target } from "@optcg/types";

import { parseUpToCardinality } from "../../cardinality/index.js";
import {
  directPowerGainTargetParsers,
  parseTargetFromSet,
  selectedPowerGainTargetParsers,
} from "../../targets/index.js";
import type { InstructionParser } from "../../types.js";
import { parsePaidCostCardCountPower } from "./dynamic-paid-cost.js";
import { parseThisCharacterRevealedCostPower } from "./dynamic-revealed-cost.js";
import { parseGainsPositivePower } from "./shared.js";

export const parsePowerGainInstruction: InstructionParser = (input) => {
  const paidCostCardCountPower = parsePaidCostCardCountPower(input);
  if (paidCostCardCountPower !== undefined) {
    return paidCostCardCountPower;
  }

  const dynamicRevealedCostPower = parseThisCharacterRevealedCostPower(input);
  if (dynamicRevealedCostPower !== undefined) {
    return dynamicRevealedCostPower;
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

function withCardinality(target: Target, cardinality: Cardinality): Target {
  if (target.type === "choose") {
    return {
      ...target,
      request: {
        ...target.request,
        min: cardinality.min,
        max: cardinality.max,
      },
    };
  }

  if (target.type === "chooseFromZones") {
    return {
      ...target,
      request: {
        ...target.request,
        min: cardinality.min,
        max: cardinality.max,
      },
    };
  }

  return target;
}
