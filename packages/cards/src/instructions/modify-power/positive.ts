import type { Cardinality, Target } from "@optcg/types";

import { parseUpToCardinality } from "../../cardinality/index.js";
import {
  parseThisCharacterTarget,
  parseYourCharactersTarget,
  parseYourLeaderOrCharacterCardsTarget,
  parseYourLeaderTarget,
  parseYourNamedCardsTarget,
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
    const targetCandidates = [
      parseYourLeaderTarget({
        text: stripLeadingOf(cardinality.rest),
      }),
      parseYourLeaderOrCharacterCardsTarget({
        text: cardinality.rest,
      }),
      parseYourCharactersTarget({ text: cardinality.rest }),
      parseYourNamedCardsTarget({ text: cardinality.rest }),
    ];

    for (const target of targetCandidates) {
      if (target?.target === undefined) {
        continue;
      }

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

  const leader = parseYourLeaderTarget(input);
  const thisLeader = parseThisLeaderTarget(input.text);
  const directTarget =
    leader?.target !== undefined
      ? leader
      : (thisLeader ??
        parseThisCharacterTarget({ text: input.text, allowImplicit: false }));
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

function parseThisLeaderTarget(text: string):
  | {
      readonly target: Target;
      readonly rest: string;
      readonly evidence: readonly ["target:thisCard"];
    }
  | undefined {
  const rest = /^This Leader\s+(?<rest>.+)$/iu.exec(text)?.groups?.["rest"];
  if (rest === undefined) {
    return undefined;
  }
  return {
    target: { type: "self" },
    rest,
    evidence: ["target:thisCard"],
  };
}

function stripLeadingOf(text: string): string {
  return text.replace(/^of\s+/iu, "");
}

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
