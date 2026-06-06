import type { Target } from "@optcg/types";

import { parseUpToCardinality } from "../cardinality/index.js";
import {
  parseThisBattleDuration,
  parseThisTurnDuration,
} from "../durations/index.js";
import {
  parseNegativePowerModifier,
  parsePositivePowerModifier,
} from "../modifiers/index.js";
import {
  parseAllFieldTarget,
  parseOpponentCharactersTarget,
  parseThisCharacterTarget,
  parseYourLeaderOrCharacterCardsTarget,
  parseYourLeaderTarget,
  parseYourNamedCardsTarget,
} from "../targets/index.js";
import type { InstructionParser } from "../types.js";
import { revealedTopLifeSet } from "./reveal-top.js";

export const modifyPowerInstructionPrimitive = {
  primitiveId: "instruction:modifyPower",
  childPrimitiveIds: [
    "cardinality:all",
    "cardinality:upTo",
    "target:opponentCharacters",
    "target:yourNamedCards",
    "target:yourLeaderOrCharacters",
    "target:yourLeader",
    "target:thisCharacter",
    "modifier:negativePower",
    "modifier:positivePower",
    "duration:thisBattle",
    "duration:thisTurn",
  ],
} as const;

export const parseModifyPowerInstruction: InstructionParser = (input) => {
  const powerGain = parsePowerGainInstruction(input);
  if (powerGain !== undefined) {
    return powerGain;
  }

  const actionMatch = /^give\s+(?<rest>.*)$/i.exec(input.text);
  const actionRest = actionMatch?.groups?.["rest"];
  if (actionRest === undefined) {
    return undefined;
  }

  const allTarget = parseAllFieldTarget({ text: actionRest });
  if (allTarget !== undefined) {
    const modifier = parseNegativePowerModifier({ text: allTarget.rest });
    if (modifier === undefined) {
      return undefined;
    }

    const duration = parseThisTurnDuration({ text: modifier.rest });
    if (duration === undefined || duration.duration === undefined) {
      return undefined;
    }

    return {
      effect: {
        type: "modifyPower",
        target: allTarget.target,
        value: modifier.value,
        duration: duration.duration,
      },
      evidence: [
        "instruction:modifyPower",
        ...allTarget.evidence,
        ...modifier.evidence,
        ...duration.evidence,
      ],
      rest: "",
    };
  }

  const cardinality = parseUpToCardinality({ text: actionRest });
  if (cardinality === undefined) {
    return undefined;
  }

  const target = parseOpponentCharactersTarget({ text: cardinality.rest });
  if (target === undefined) {
    return undefined;
  }

  const modifier = parseNegativePowerModifier({ text: target.rest });
  if (modifier === undefined) {
    return undefined;
  }

  const duration = parseThisTurnDuration({ text: modifier.rest });
  if (duration === undefined || duration.duration === undefined) {
    return undefined;
  }

  return {
    effect: {
      type: "modifyPower",
      target: chooseOpponentCharactersTarget(
        cardinality.cardinality.max,
        target.filter ?? { categories: ["character"] },
      ),
      value: modifier.value,
      duration: duration.duration,
    },
    evidence: [
      "instruction:modifyPower",
      ...cardinality.evidence,
      "chooser:self:upTo",
      ...target.evidence,
      ...modifier.evidence,
      ...duration.evidence,
    ],
    rest: "",
  };
};

const parsePowerGainInstruction: InstructionParser = (input) => {
  const dynamicRevealedCostPower = parseThisCharacterRevealedCostPower(input);
  if (dynamicRevealedCostPower !== undefined) {
    return dynamicRevealedCostPower;
  }

  const cardinality = parseUpToCardinality(input);
  if (cardinality !== undefined) {
    const target =
      parseYourLeaderOrCharacterCardsTarget({
        text: cardinality.rest,
      }) ?? parseYourNamedCardsTarget({ text: cardinality.rest });
    if (target?.target !== undefined) {
      const parsed = parseGainsPositivePower(target.target, target.rest);
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

const parseThisCharacterRevealedCostPower: InstructionParser = (input) => {
  const match =
    /^This Character gains \+(?<amount>\d+) power during this turn per 1 cost on the revealed card\.?$/iu.exec(
      input.text.trim(),
    );
  const rawAmount = match?.groups?.["amount"];
  if (rawAmount === undefined) {
    return undefined;
  }
  const amount = Number(rawAmount);
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    return undefined;
  }

  return {
    effect: {
      type: "modifyPower",
      target: { type: "self" },
      value: {
        type: "sumSelectedCardCosts",
        selection: revealedTopLifeSet,
        multiplier: amount,
      },
      duration: { type: "thisTurn" },
    },
    evidence: [
      "instruction:modifyPower",
      "target:thisCharacter",
      "value:dynamic:selectedCardCost",
      "modifier:positivePower",
      "duration:thisTurn",
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
  const match = /^This Leader\s+(?<rest>.+)$/iu.exec(text);
  const rest = match?.groups?.["rest"];
  if (rest === undefined) {
    return undefined;
  }
  return {
    target: { type: "self" },
    rest,
    evidence: ["target:thisCard"],
  };
}

function parseGainsPositivePower(target: Target, text: string) {
  const actionMatch = /^gains\s+(?<rest>.*)$/i.exec(text);
  const modifierText = actionMatch?.groups?.["rest"];
  if (modifierText === undefined) {
    return undefined;
  }

  const modifier = parsePositivePowerModifier({ text: modifierText });
  if (modifier === undefined) {
    return undefined;
  }

  const duration =
    parseThisBattleDuration({ text: modifier.rest }) ??
    parseThisTurnDuration({ text: modifier.rest });
  if (duration?.duration === undefined) {
    return undefined;
  }

  return {
    effect: {
      type: "modifyPower" as const,
      target,
      value: modifier.value,
      duration: duration.duration,
    },
    evidence: [...modifier.evidence, ...duration.evidence],
  };
}

function chooseOpponentCharactersTarget(
  max: number,
  filter: TargetFilter,
): Target {
  return {
    type: "choose",
    request: {
      timing: "onResolution",
      chooser: "self",
      player: "opponent",
      zone: "characterArea",
      min: 0,
      max,
      allowFewerIfUnavailable: true,
      visibility: "public",
      filter,
    },
  };
}

type TargetFilter = NonNullable<
  Extract<Target, { type: "choose" }>["request"]["filter"]
>;
