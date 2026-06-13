import {
  parseDurationFromSet,
  replacementDurationParsers,
} from "../../../durations/index.js";
import {
  allPowerModifierParsers,
  parseModifierFromSet,
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

export function parseReturnSelfToOwnerHandInstead(
  text: string,
): ReplacementInsteadParseResult | undefined {
  if (
    !/^you may return this Character to the owner's hand instead\.?$/i.test(
      text.trim(),
    )
  ) {
    return undefined;
  }

  return {
    effect: {
      type: "bounce",
      destination: "hand",
      target: { type: "self" },
    },
    evidence: [
      "instruction:bounce",
      "target:thisCharacter",
      "destination:hand",
    ],
  };
}

export function parseModifyPowerInstead(
  text: string,
): ReplacementInsteadParseResult | undefined {
  const match =
    /^you may give (?<target>your Leader|this Character) (?<modifier>.+?) instead\.?$/iu.exec(
      text.trim(),
    );
  const targetText = match?.groups?.["target"];
  const modifierText = match?.groups?.["modifier"];
  if (targetText === undefined || modifierText === undefined) {
    return undefined;
  }

  const modifier = parseModifierFromSet(
    { text: modifierText },
    allPowerModifierParsers,
  );
  if (modifier === undefined) {
    return undefined;
  }

  const duration = parseDurationFromSet(
    { text: modifier.rest },
    replacementDurationParsers,
  );
  if (duration?.duration === undefined) {
    return undefined;
  }

  return {
    effect: {
      type: "modifyPower",
      target:
        targetText.toLowerCase() === "your leader"
          ? { type: "myLeader" }
          : { type: "self" },
      value: modifier.value,
      duration: duration.duration,
    },
    evidence: [
      "instruction:modifyPower",
      targetText.toLowerCase() === "your leader"
        ? "target:yourLeader"
        : "target:thisCharacter",
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
