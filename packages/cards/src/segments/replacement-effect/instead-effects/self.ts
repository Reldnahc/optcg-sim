import { parseThisTurnDuration } from "../../../durations/index.js";
import {
  parseNegativePowerModifier,
  parsePositivePowerModifier,
} from "../../../modifiers/index.js";
import type { ReplacementInsteadParseResult } from "../shared.js";

export function parseTrashSelfInstead(
  text: string,
): ReplacementInsteadParseResult | undefined {
  if (!/^you may trash this Character instead\.?$/i.test(text.trim())) {
    return undefined;
  }

  return {
    effect: {
      type: "trash",
      target: { type: "self" },
    },
    evidence: ["instruction:trash", "target:thisCharacter"],
  };
}

export function parseKoSelfInstead(
  text: string,
): ReplacementInsteadParseResult | undefined {
  if (!/^you may K\.O\. this Character instead\.?$/i.test(text.trim())) {
    return undefined;
  }

  return {
    effect: {
      type: "ko",
      target: { type: "self" },
    },
    evidence: ["instruction:ko", "target:thisCharacter"],
  };
}

export function parseModifyLeaderPowerInstead(
  text: string,
): ReplacementInsteadParseResult | undefined {
  const modifierText =
    /^you may give your Leader (?<modifier>.+?) instead\.?$/iu.exec(text.trim())
      ?.groups?.["modifier"];
  if (modifierText === undefined) {
    return undefined;
  }

  const modifier =
    parseNegativePowerModifier({ text: modifierText }) ??
    parsePositivePowerModifier({ text: modifierText });
  if (modifier === undefined) {
    return undefined;
  }

  const duration = parseThisTurnDuration({ text: modifier.rest });
  if (duration?.duration === undefined) {
    return undefined;
  }

  return {
    effect: {
      type: "modifyPower",
      target: { type: "myLeader" },
      value: modifier.value,
      duration: duration.duration,
    },
    evidence: [
      "instruction:modifyPower",
      "target:yourLeader",
      ...modifier.evidence,
      ...duration.evidence,
    ],
  };
}

export function parseRestSelfInstead(
  text: string,
): ReplacementInsteadParseResult | undefined {
  if (!/^you may rest this Character instead\.?$/i.test(text.trim())) {
    return undefined;
  }

  return {
    effect: {
      type: "rest",
      target: { type: "self" },
    },
    evidence: ["instruction:rest", "target:thisCharacter"],
  };
}
