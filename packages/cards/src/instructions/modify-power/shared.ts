import type { Cardinality, Target } from "@optcg/types";

import {
  fieldEffectDurationParsers,
  parseDurationFromSet,
} from "../../durations/index.js";
import { parsePositivePowerModifier } from "../../modifiers/index.js";
import { parseAttachedDonScaledValue } from "../../values/dynamic-number.js";

export const modifyPowerInstructionPrimitive = {
  primitiveId: "instruction:modifyPower",
  childPrimitiveIds: [
    "cardinality:all",
    "cardinality:upTo",
    "target:opponentCharacters",
    "target:opponentLeaderOrCharacters",
    "target:yourNamedCards",
    "target:yourCharacters",
    "target:yourLeaderOrCharacters",
    "target:yourLeader",
    "target:thisCharacter",
    "modifier:negativePower",
    "modifier:positivePower",
    "duration:thisBattle",
    "duration:thisTurn",
    "duration:selfNextTurnStart",
    "duration:opponentNextEndPhase",
    "duration:opponentNextRefreshPhase",
  ],
} as const;

export function parseGainsPositivePower(target: Target, text: string) {
  const modifierText = /^gains?\s+(?<rest>.*)$/i.exec(text)?.groups?.["rest"];
  if (modifierText === undefined) {
    return undefined;
  }

  const modifier = parsePositivePowerModifier({ text: modifierText });
  if (modifier === undefined) {
    return undefined;
  }

  const duration = parseDurationFromSet(
    { text: modifier.rest },
    fieldEffectDurationParsers,
  );
  const dynamicDuration =
    typeof modifier.value === "number"
      ? parseAttachedDonScaledValue(modifier.value, modifier.rest)
      : undefined;
  const parsedDuration = dynamicDuration ?? duration;
  if (parsedDuration?.duration === undefined) {
    return undefined;
  }

  return {
    effect: {
      type: "modifyPower" as const,
      target,
      value: dynamicDuration?.value ?? modifier.value,
      duration: parsedDuration.duration,
    },
    evidence: [...modifier.evidence, ...parsedDuration.evidence],
  };
}

export function parseAttachedDonScaledDuration(
  multiplier: number,
  text: string,
): ReturnType<typeof parseAttachedDonScaledValue> {
  return parseAttachedDonScaledValue(multiplier, text);
}

export function withCardinality(
  target: Target,
  cardinality: Cardinality,
): Target {
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
