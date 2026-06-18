import type { Effect } from "@optcg/types";

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
    /^you may give (?<target>your Leader|this Character|that Character|that card) (?<modifier>.+?) instead\.?$/iu.exec(
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
      target: powerInsteadTarget(targetText),
      value: modifier.value,
      duration: duration.duration,
    },
    evidence: [
      "instruction:modifyPower",
      powerInsteadTargetEvidence(targetText),
      ...modifier.evidence,
      ...duration.evidence,
    ],
  };
}

const powerInsteadTarget = (
  targetText: string,
): Extract<Effect, { type: "modifyPower" }>["target"] => {
  const normalized = targetText.toLowerCase();
  if (normalized === "your leader") {
    return { type: "myLeader" };
  }
  if (normalized === "that character" || normalized === "that card") {
    return { type: "replacementTarget" };
  }
  return { type: "self" };
};

const powerInsteadTargetEvidence = (targetText: string) => {
  const normalized = targetText.toLowerCase();
  if (normalized === "your leader") {
    return "target:yourLeader" as const;
  }
  if (normalized === "that character" || normalized === "that card") {
    return "target:replacementTarget" as const;
  }
  return "target:thisCharacter" as const;
};

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
