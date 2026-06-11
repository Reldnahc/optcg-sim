import type { DynamicNumberValue, Duration, Target } from "@optcg/types";

import { parseExplicitFieldEffectDuration } from "../../durations/index.js";
import { parsePositivePowerModifier } from "../../modifiers/index.js";
import type { PrimitiveEvidence } from "../../types.js";

export const modifyPowerInstructionPrimitive = {
  primitiveId: "instruction:modifyPower",
  childPrimitiveIds: [
    "cardinality:all",
    "cardinality:upTo",
    "target:opponentCharacters",
    "target:yourNamedCards",
    "target:yourCharacters",
    "target:yourLeaderOrCharacters",
    "target:yourLeader",
    "target:thisCharacter",
    "modifier:negativePower",
    "modifier:positivePower",
    "duration:thisBattle",
    "duration:thisTurn",
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

  const duration = parseExplicitFieldEffectDuration({ text: modifier.rest });
  const dynamicDuration =
    typeof modifier.value === "number"
      ? parseAttachedDonScaledDuration(modifier.value, modifier.rest)
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
    evidence: [
      ...modifier.evidence,
      ...parsedDuration.evidence,
      ...(dynamicDuration?.evidence ?? []),
    ],
  };
}

export function parseAttachedDonScaledDuration(
  multiplier: number,
  text: string,
):
  | {
      readonly duration: Duration;
      readonly value: DynamicNumberValue;
      readonly evidence: readonly PrimitiveEvidence[];
    }
  | undefined {
  const match =
    /^(?<duration>[\s\S]+?)\s+for every DON!! card given to (?<target>this Character|that Character)\.?$/iu.exec(
      text.trim(),
    );
  const durationText = match?.groups?.["duration"];
  const targetText = match?.groups?.["target"];
  if (durationText === undefined || targetText === undefined) {
    return undefined;
  }
  const duration = parseExplicitFieldEffectDuration({ text: durationText });
  if (duration?.duration === undefined || duration.rest.length > 0) {
    return undefined;
  }
  return {
    duration: duration.duration,
    value: {
      type: "countAttachedDon",
      target: { type: "self" },
      per: 1,
      multiplier,
    },
    evidence: ["value:dynamic:attachedDonCount", "target:thisCharacter"],
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
