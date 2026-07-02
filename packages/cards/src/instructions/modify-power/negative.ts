import { parseUpToCardinality } from "../../cardinality/index.js";
import {
  fieldEffectDurationParsers,
  parseDurationFromSet,
} from "../../durations/index.js";
import { parseNegativePowerModifier } from "../../modifiers/index.js";
import {
  opponentNegativePowerTargetParsers,
  parseAllFieldTarget,
  parseTargetFromSet,
} from "../../targets/index.js";
import type { InstructionParser } from "../../types.js";
import { selectThenApplyFieldTarget } from "../effect-builders.js";
import {
  parseAttachedDonScaledDuration,
  parseMatchingZoneCardsScaledDurationForPower,
  withCardinality,
} from "./shared.js";

export const parseNegativePowerInstruction: InstructionParser = (input) => {
  const targetGains = parseTargetGainsNegativePowerInstruction(input.text);
  if (targetGains !== undefined) {
    return targetGains;
  }

  const actionRest = /^give\s+(?<rest>.*)$/i.exec(input.text)?.groups?.["rest"];
  if (actionRest === undefined) {
    return undefined;
  }

  const modifierFirst = parseModifierFirstNegativePowerInstruction(actionRest);
  if (modifierFirst !== undefined) {
    return modifierFirst;
  }

  const opponentLeaderAndCharacters =
    parseOpponentLeaderAndAllCharactersNegativePowerInstruction(actionRest);
  if (opponentLeaderAndCharacters !== undefined) {
    return opponentLeaderAndCharacters;
  }

  const opponentLeaderAndCharacterEach =
    parseOpponentLeaderAndCharacterEachNegativePowerInstruction(actionRest);
  if (opponentLeaderAndCharacterEach !== undefined) {
    return opponentLeaderAndCharacterEach;
  }

  const allTarget = parseAllFieldTarget({ text: actionRest });
  if (allTarget !== undefined) {
    const modifier = parseNegativePowerModifier({ text: allTarget.rest });
    if (modifier === undefined) {
      return undefined;
    }

    const dynamicDuration = parseDynamicNegativePowerDuration(
      modifier.value,
      modifier.rest,
    );
    const duration =
      dynamicDuration ??
      parseDurationFromSet({ text: modifier.rest }, fieldEffectDurationParsers);
    if (duration === undefined || duration.duration === undefined) {
      return undefined;
    }

    return {
      effect: {
        type: "modifyPower",
        target: allTarget.target,
        value: dynamicDuration?.value ?? modifier.value,
        duration: duration.duration,
      },
      evidence: [
        "instruction:modifyPower",
        ...allTarget.evidence,
        ...modifier.evidence,
        ...duration.evidence,
        ...(dynamicDuration?.evidence ?? []),
      ],
      rest: "",
    };
  }

  const cardinality = parseUpToCardinality({ text: actionRest });
  if (cardinality === undefined) {
    return undefined;
  }

  const target = parseTargetFromSet(
    { text: cardinality.rest },
    opponentNegativePowerTargetParsers(),
  );
  if (target?.target === undefined) {
    return undefined;
  }

  const modifier = parseNegativePowerModifier({ text: target.rest });
  if (modifier === undefined) {
    return undefined;
  }

  const dynamicDuration = parseDynamicNegativePowerDuration(
    modifier.value,
    modifier.rest,
  );
  const duration =
    dynamicDuration ??
    parseDurationFromSet({ text: modifier.rest }, fieldEffectDurationParsers);
  if (duration === undefined || duration.duration === undefined) {
    return undefined;
  }

  return {
    effect: {
      type: "modifyPower",
      target: withCardinality(target.target, cardinality.cardinality),
      value: dynamicDuration?.value ?? modifier.value,
      duration: duration.duration,
    },
    evidence: [
      "instruction:modifyPower",
      ...cardinality.evidence,
      "chooser:self:upTo",
      ...target.evidence,
      ...modifier.evidence,
      ...duration.evidence,
      ...(dynamicDuration?.evidence ?? []),
    ],
    rest: "",
  };
};

function parseTargetGainsNegativePowerInstruction(
  text: string,
): ReturnType<InstructionParser> {
  const cardinality = parseUpToCardinality({ text });
  if (cardinality === undefined) {
    return undefined;
  }

  const target = parseTargetFromSet(
    { text: cardinality.rest },
    opponentNegativePowerTargetParsers(),
  );
  if (target?.target === undefined) {
    return undefined;
  }

  const modifierText = /^gains?\s+(?<rest>.*)$/iu.exec(target.rest)?.groups?.[
    "rest"
  ];
  if (modifierText === undefined) {
    return undefined;
  }

  const modifier = parseNegativePowerModifier({ text: modifierText });
  if (modifier === undefined) {
    return undefined;
  }

  const duration = parseDurationFromSet(
    { text: modifier.rest },
    fieldEffectDurationParsers,
  );
  if (duration === undefined || duration.duration === undefined) {
    return undefined;
  }

  return {
    effect: {
      type: "modifyPower",
      target: withCardinality(target.target, cardinality.cardinality),
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
}

function parseDynamicNegativePowerDuration(
  multiplier: number,
  text: string,
): ReturnType<typeof parseAttachedDonScaledDuration> {
  return (
    parseAttachedDonScaledDuration(multiplier, text) ??
    parseMatchingZoneCardsScaledDurationForPower(multiplier, text)
  );
}

function parseOpponentLeaderAndAllCharactersNegativePowerInstruction(
  actionRest: string,
): ReturnType<InstructionParser> {
  const match =
    /^your opponent's Leader and all of (?:their|your opponent's) Characters?\s+(?<modifier>[\s\S]+)$/iu.exec(
      actionRest,
    );
  const modifierText = match?.groups?.["modifier"];
  if (modifierText === undefined) {
    return undefined;
  }

  const modifier = parseNegativePowerModifier({ text: modifierText });
  if (modifier === undefined) {
    return undefined;
  }
  const duration = parseDurationFromSet(
    { text: modifier.rest },
    fieldEffectDurationParsers,
  );
  if (duration === undefined || duration.duration === undefined) {
    return undefined;
  }

  return {
    effect: {
      type: "sequence",
      effects: [
        {
          connector: "always",
          effect: {
            type: "modifyPower",
            target: {
              type: "all",
              zone: "leaderArea",
              player: "opponent",
              filter: { categories: ["leader"] },
            },
            value: modifier.value,
            duration: duration.duration,
          },
        },
        {
          connector: "then",
          effect: {
            type: "modifyPower",
            target: {
              type: "all",
              zone: "characterArea",
              player: "opponent",
              filter: { categories: ["character"] },
            },
            value: modifier.value,
            duration: duration.duration,
          },
        },
      ],
    },
    evidence: [
      "instruction:modifyPower",
      "cardinality:all",
      "target:opponentLeaderOrCharacters",
      "player:opponent",
      "zone:leaderArea",
      "zone:characterArea",
      "filter:category:leader",
      "filter:category:character",
      ...modifier.evidence,
      ...duration.evidence,
    ],
    rest: "",
  };
}

function parseOpponentLeaderAndCharacterEachNegativePowerInstruction(
  actionRest: string,
): ReturnType<InstructionParser> {
  const match =
    /^up to 1 (?:of )?each of your opponent's Leader and Character cards?\s+(?<modifier>[\s\S]+)$/iu.exec(
      actionRest,
    );
  const modifierText = match?.groups?.["modifier"];
  if (modifierText === undefined) {
    return undefined;
  }

  const modifier = parseNegativePowerModifier({ text: modifierText });
  if (modifier === undefined) {
    return undefined;
  }
  const duration = parseDurationFromSet(
    { text: modifier.rest },
    fieldEffectDurationParsers,
  );
  if (duration === undefined || duration.duration === undefined) {
    return undefined;
  }
  const effectDuration = duration.duration;

  const leader = selectThenApplyFieldTarget({
    selectionId: "selected:modify-power-leader-target",
    selectId: "select:modify-power-leader-target",
    player: "opponent",
    zones: ["leaderArea"],
    min: 0,
    max: 1,
    filter: { categories: ["leader"] },
    apply: (target) => ({
      type: "modifyPower",
      target,
      value: modifier.value,
      duration: effectDuration,
    }),
  });
  const character = selectThenApplyFieldTarget({
    selectionId: "selected:modify-power-character-target",
    selectId: "select:modify-power-character-target",
    player: "opponent",
    zones: ["characterArea"],
    min: 0,
    max: 1,
    filter: { categories: ["character"] },
    apply: (target) => ({
      type: "modifyPower",
      target,
      value: modifier.value,
      duration: effectDuration,
    }),
  });

  return {
    effect: {
      type: "sequence",
      effects: [
        { connector: "always", effect: leader },
        { connector: "then", effect: character },
      ],
    },
    evidence: [
      "instruction:modifyPower",
      "composition:sequence",
      "composition:selectThenApply",
      "cardinality:upTo",
      "count:positiveInteger",
      "chooser:self:upTo",
      "target:opponentLeader",
      "player:opponent",
      "zone:leaderArea",
      "filter:category:leader",
      "target:opponentCharacters",
      "zone:characterArea",
      "filter:category:character",
      ...modifier.evidence,
      ...duration.evidence,
    ],
    rest: "",
  };
}

function parseModifierFirstNegativePowerInstruction(
  actionRest: string,
): ReturnType<InstructionParser> {
  const modifier = parseNegativePowerModifier({ text: actionRest });
  if (modifier === undefined) {
    return undefined;
  }
  const match =
    /^(?<duration>[\s\S]+?)\s+to\s+(?<target>up to [1-9]\d*[\s\S]+)$/iu.exec(
      modifier.rest,
    );
  const durationText = match?.groups?.["duration"];
  const targetText = match?.groups?.["target"];
  if (durationText === undefined || targetText === undefined) {
    return undefined;
  }
  const duration = parseDurationFromSet(
    { text: durationText },
    fieldEffectDurationParsers,
  );
  if (duration?.duration === undefined || duration.rest.length > 0) {
    return undefined;
  }
  const cardinality = parseUpToCardinality({ text: targetText });
  if (cardinality === undefined) {
    return undefined;
  }
  const target = parseTargetFromSet(
    { text: cardinality.rest },
    opponentNegativePowerTargetParsers(),
  );
  if (target?.target === undefined) {
    return undefined;
  }
  if (target.rest.length > 0 && target.rest !== ".") {
    return undefined;
  }

  return {
    effect: {
      type: "modifyPower",
      target: withCardinality(target.target, cardinality.cardinality),
      value: modifier.value,
      duration: duration.duration,
    },
    evidence: [
      "instruction:modifyPower",
      ...modifier.evidence,
      ...duration.evidence,
      ...cardinality.evidence,
      "chooser:self:upTo",
      ...target.evidence,
    ],
    rest: "",
  };
}
