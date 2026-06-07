import type { Target } from "@optcg/types";

import {
  parseThisBattleDuration,
  parseThisTurnDuration,
} from "../../durations/index.js";
import { parsePositivePowerModifier } from "../../modifiers/index.js";

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

export function parseGainsPositivePower(target: Target, text: string) {
  const modifierText = /^gains\s+(?<rest>.*)$/i.exec(text)?.groups?.["rest"];
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

export function chooseOpponentCharactersTarget(
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
