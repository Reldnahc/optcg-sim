import { parseUpToCardinality } from "../../cardinality/index.js";
import {
  attackRestrictionDurationParsers,
  parseDurationFromSet,
} from "../../durations/index.js";
import { parseCardFilterPredicates } from "../../filters/index.js";
import { parseOpponentCharactersTarget } from "../../targets/index.js";
import type { InstructionParser } from "../../types.js";
import { selectThenApplyFieldTarget } from "../effect-builders.js";
import { thatCharacterSelectionId } from "./shared.js";

export const preventOpponentCharactersAttackPrimitive = {
  primitiveId: "instruction:preventActivation",
  childPrimitiveIds: [
    "cardinality:upTo",
    "target:opponentCharacters",
    "duration:opponentNextEndPhase",
    "duration:thisTurn",
  ],
} as const;

export const parsePreventOpponentCharactersAttackInstruction: InstructionParser =
  (input) => {
    const mixedLeaderOrCharacter =
      parseOpponentRestedLeaderOrCharacterAttackRestriction(input);
    if (mixedLeaderOrCharacter !== undefined) {
      return mixedLeaderOrCharacter;
    }

    const cardinality = parseUpToCardinality({ text: input.text });
    if (cardinality === undefined) {
      return undefined;
    }

    const target = parseOpponentCharactersTarget({ text: cardinality.rest });
    if (target === undefined) {
      return undefined;
    }

    const durationText = /^cannot attack\s+(?<rest>.*)$/i.exec(target.rest)
      ?.groups?.["rest"];
    if (durationText === undefined) {
      return undefined;
    }

    const duration = parseDurationFromSet(
      { text: durationText },
      attackRestrictionDurationParsers,
    );
    if (
      duration === undefined ||
      duration.duration === undefined ||
      duration.rest.length > 0
    ) {
      return undefined;
    }
    const parsedDuration = duration.duration;

    return {
      effect: selectThenApplyFieldTarget({
        selectionId: thatCharacterSelectionId,
        selectId: "select:cannot-attack",
        player: "opponent",
        zone: "characterArea",
        filter: target.filter ?? { categories: ["character"] },
        min: cardinality.cardinality.min,
        max: cardinality.cardinality.max,
        apply: (target) => ({
          type: "cannotAttack",
          target,
          duration: parsedDuration,
        }),
      }),
      evidence: [
        "instruction:preventActivation",
        ...cardinality.evidence,
        "chooser:self:upTo",
        ...target.evidence,
        ...duration.evidence,
        "composition:selectThenApply",
      ],
      rest: "",
    };
  };

const parseOpponentRestedLeaderOrCharacterAttackRestriction: InstructionParser =
  (input) => {
    const match =
      /^Your opponent's rested Leader or (?<characterText>up to [1-9]\d* of your opponent's .+?) cannot attack (?<durationText>.+)$/iu.exec(
        input.text,
      );
    const characterText = match?.groups?.["characterText"];
    const durationText = match?.groups?.["durationText"];
    if (characterText === undefined || durationText === undefined) {
      return undefined;
    }

    const cardinality = parseUpToCardinality({ text: characterText });
    if (cardinality === undefined) {
      return undefined;
    }
    const characterTarget = parseOpponentCharactersTarget({
      text: cardinality.rest,
    });
    if (characterTarget === undefined || characterTarget.rest.length > 0) {
      return undefined;
    }

    const duration = parseDurationFromSet(
      { text: durationText },
      attackRestrictionDurationParsers,
    );
    if (
      duration === undefined ||
      duration.duration === undefined ||
      duration.rest.length > 0
    ) {
      return undefined;
    }
    const parsedDuration = duration.duration;

    return {
      effect: selectThenApplyFieldTarget({
        selectionId: thatCharacterSelectionId,
        selectId: "select:cannot-attack",
        player: "opponent",
        zones: ["leaderArea", "characterArea"],
        filter: {
          anyOf: [
            { categories: ["leader"], state: "rested" },
            characterTarget.filter ?? { categories: ["character"] },
          ],
        },
        min: cardinality.cardinality.min,
        max: cardinality.cardinality.max,
        apply: (target) => ({
          type: "cannotAttack",
          target,
          duration: parsedDuration,
        }),
      }),
      evidence: [
        "instruction:preventActivation",
        ...cardinality.evidence,
        "chooser:self:upTo",
        "target:opponentLeaderOrCharacters",
        "player:opponent",
        "filter:anyOf",
        "filter:category:leader",
        "filter:state:rested",
        ...characterTarget.evidence,
        ...duration.evidence,
        "composition:selectThenApply",
      ],
      rest: "",
    };
  };

export const parseSelfAttackTargetRestrictionInstruction: InstructionParser = (
  input,
) => {
  const match =
    /^This (?<subject>Leader|Character) cannot attack (?<target>your opponent's .+?) (?<duration>during this turn\.?)$/iu.exec(
      input.text,
    );
  const subject = match?.groups?.["subject"]?.toLowerCase();
  const targetText = match?.groups?.["target"];
  const durationText = match?.groups?.["duration"];
  if (
    (subject !== "leader" && subject !== "character") ||
    targetText === undefined ||
    durationText === undefined
  ) {
    return undefined;
  }

  const targetMatch = /^your opponent's (?<filter>.+)$/iu.exec(targetText);
  const filterText = targetMatch?.groups?.["filter"];
  if (filterText === undefined) {
    return undefined;
  }
  const parsedFilter = parseCardFilterPredicates({ text: filterText });
  if (
    parsedFilter === undefined ||
    parsedFilter.rest.trim().length > 0 ||
    parsedFilter.filter.categories?.includes("character") !== true
  ) {
    return undefined;
  }

  const duration = parseDurationFromSet(
    { text: durationText },
    attackRestrictionDurationParsers,
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
      type: "cannotAttackTarget",
      target: subject === "leader" ? { type: "myLeader" } : { type: "self" },
      attackTarget: {
        player: "opponent",
        zone: "characterArea",
        filter: parsedFilter.filter,
      },
      duration: duration.duration,
    },
    evidence: [
      "instruction:cannotAttackTarget",
      subject === "leader" ? "target:yourLeader" : "target:thisCharacter",
      "player:opponent",
      "zone:characterArea",
      ...parsedFilter.evidence,
      ...duration.evidence,
    ],
    rest: "",
  };
};
