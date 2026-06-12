import {
  opponentNextEndOnlyDurationParsers,
  parseDurationFromSet,
} from "../../durations/index.js";
import { parsePositivePowerModifier } from "../../modifiers/index.js";
import { parseYourLeaderTarget } from "../../targets/index.js";
import type { InstructionParser } from "../../types.js";

export const yourLeaderPowerOpponentNextEndPrimitive = {
  primitiveId: "instruction:modifyPower",
  childPrimitiveIds: [
    "target:yourLeader",
    "modifier:positivePower",
    "duration:opponentNextEndPhase",
  ],
} as const;

export const parseYourLeaderPowerOpponentNextEndInstruction: InstructionParser =
  (input) => {
    const target = parseYourLeaderTarget(input);
    if (target === undefined || target.target === undefined) {
      return undefined;
    }

    const modifierText = /^gains\s+(?<rest>.*)$/i.exec(target.rest)?.groups?.[
      "rest"
    ];
    if (modifierText === undefined) {
      return undefined;
    }

    const modifier = parsePositivePowerModifier({ text: modifierText });
    if (modifier === undefined) {
      return undefined;
    }

    const duration = parseDurationFromSet(
      { text: modifier.rest },
      opponentNextEndOnlyDurationParsers,
    );
    if (
      duration === undefined ||
      duration.duration === undefined ||
      duration.rest.length > 0
    ) {
      return undefined;
    }

    return {
      effect: {
        type: "modifyPower",
        target: target.target,
        value: modifier.value,
        duration: duration.duration,
      },
      evidence: [
        "instruction:modifyPower",
        ...target.evidence,
        ...modifier.evidence,
        ...duration.evidence,
      ],
      rest: "",
    };
  };
