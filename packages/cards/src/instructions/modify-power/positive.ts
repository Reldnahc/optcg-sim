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

  const selfAndLeaderPower = parseThisCharacterAndLeaderPower(input);
  if (selfAndLeaderPower !== undefined) {
    return selfAndLeaderPower;
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

const parseThisCharacterAndLeaderPower: InstructionParser = (input) => {
  const match =
    /^This Character and up to 1 of your Leader gain (?<modifier>\+[1-9]\d* power .+)$/iu.exec(
      input.text,
    );
  const modifierText = match?.groups?.["modifier"];
  if (modifierText === undefined) {
    return undefined;
  }

  const self = parsePowerGainInstruction({
    text: `This Character gains ${modifierText}`,
  });
  const leader = parsePowerGainInstruction({
    text: `up to 1 of your Leader gains ${modifierText}`,
  });
  if (
    self === undefined ||
    leader === undefined ||
    self.rest.length > 0 ||
    leader.rest.length > 0
  ) {
    return undefined;
  }

  return {
    effect: {
      type: "sequence",
      effects: [
        { connector: "always", effect: self.effect },
        { connector: "then", effect: leader.effect },
      ],
    },
    evidence: [...self.evidence, ...leader.evidence, "composition:sequence"],
    rest: "",
  };
};
