import type { CardFilter, Target } from "@optcg/types";

import { parseUpToCardinality } from "../cardinality/index.js";
import {
  parseOpponentNextEndPhaseDuration,
  parseOpponentNextRefreshPhaseDuration,
} from "../durations/index.js";
import { parsePositivePowerModifier } from "../modifiers/index.js";
import { parseThatCharacterReference } from "../references/index.js";
import {
  parseAllFieldTarget,
  parseOpponentCharactersTarget,
  parseOpponentLeaderOrCharacterCardsTarget,
  parseYourLeaderTarget,
} from "../targets/index.js";
import type { InstructionParser, PrimitiveEvidence } from "../types.js";

const thatCharacterSelectionId = "selected:thatCharacter";

const thatCharacterSavedTarget = {
  type: "savedFieldObject",
  binding: {
    family: "selectedTargets",
    saveResultAs: thatCharacterSelectionId,
  },
  zone: "characterArea",
  player: "opponent",
  visibility: "publicOnly",
  onFailure: "failClosed",
} as const;

export const restOpponentCharactersPrimitive = {
  primitiveId: "instruction:rest",
  childPrimitiveIds: ["cardinality:upTo", "target:opponentCharacters"],
} as const;

export const restOpponentLeaderOrCharactersPrimitive = {
  primitiveId: "instruction:rest",
  childPrimitiveIds: ["cardinality:upTo", "target:opponentLeaderOrCharacters"],
} as const;

export const preventThatCharacterRefreshPrimitive = {
  primitiveId: "instruction:preventActivation",
  childPrimitiveIds: [
    "reference:thatCharacter",
    "duration:opponentNextRefreshPhase",
  ],
} as const;

export const preventOpponentCharactersRefreshPrimitive = {
  primitiveId: "instruction:preventActivation",
  childPrimitiveIds: [
    "cardinality:all",
    "cardinality:upTo",
    "target:opponentCharacters",
    "duration:opponentNextRefreshPhase",
  ],
} as const;

export const yourLeaderPowerOpponentNextEndPrimitive = {
  primitiveId: "instruction:modifyPower",
  childPrimitiveIds: [
    "target:yourLeader",
    "modifier:positivePower",
    "duration:opponentNextEndPhase",
  ],
} as const;

export const parseRestOpponentCharactersInstruction: InstructionParser = (
  input,
) => {
  const actionMatch = /^Rest\s+(?<rest>.*)$/i.exec(input.text);
  const actionRest = actionMatch?.groups?.["rest"];
  if (actionRest === undefined) {
    return undefined;
  }

  const cardinality = parseUpToCardinality({ text: actionRest });
  if (cardinality === undefined) {
    return undefined;
  }

  const target = parseOpponentCharactersTarget({ text: cardinality.rest });
  if (target === undefined || (target.rest.length > 0 && target.rest !== ".")) {
    return undefined;
  }

  return {
    effect: {
      type: "sequence",
      effects: [
        {
          id: "select:that-character",
          connector: "always",
          saveResultAs: thatCharacterSelectionId,
          effect: {
            type: "selectTargets",
            request: {
              timing: "onResolution",
              chooser: "self",
              player: "opponent",
              zone: "characterArea",
              filter: target.filter ?? { categories: ["character"] },
              min: cardinality.cardinality.min,
              max: cardinality.cardinality.max,
              allowFewerIfUnavailable: true,
              visibility: "public",
            },
          },
        },
        {
          connector: "then",
          effect: {
            type: "rest",
            target: thatCharacterSavedTarget,
          },
        },
      ],
    },
    evidence: [
      "instruction:rest",
      ...cardinality.evidence,
      "chooser:self:upTo",
      ...target.evidence,
    ],
    rest: "",
  };
};

export const parseRestOpponentLeaderOrCharactersInstruction: InstructionParser =
  (input) => {
    const actionMatch = /^Rest\s+(?<rest>.*)$/i.exec(input.text);
    const actionRest = actionMatch?.groups?.["rest"];
    if (actionRest === undefined) {
      return undefined;
    }

    const cardinality = parseUpToCardinality({ text: actionRest });
    if (cardinality === undefined) {
      return undefined;
    }

    const target = parseOpponentLeaderOrCharacterCardsTarget({
      text: cardinality.rest,
    });
    if (
      target === undefined ||
      target.target?.type !== "chooseFromZones" ||
      (target.rest.length > 0 && target.rest !== ".")
    ) {
      return undefined;
    }

    return {
      effect: {
        type: "rest",
        target: {
          type: "chooseFromZones",
          request: {
            ...target.target.request,
            min: cardinality.cardinality.min,
            max: cardinality.cardinality.max,
            allowFewerIfUnavailable: true,
          },
        },
      },
      evidence: [
        "instruction:rest",
        ...cardinality.evidence,
        "chooser:self:upTo",
        ...target.evidence,
      ],
      rest: "",
    };
  };

export const parsePreventThatCharacterRefreshInstruction: InstructionParser = (
  input,
) => {
  const reference = parseThatCharacterReference(input);
  if (reference === undefined) {
    return undefined;
  }

  const actionMatch = /^will not become active\s+(?<rest>.*)$/i.exec(
    reference.rest,
  );
  const durationText = actionMatch?.groups?.["rest"];
  if (durationText === undefined) {
    return undefined;
  }

  const duration = parseOpponentNextRefreshPhaseDuration({
    text: durationText,
  });
  if (
    duration === undefined ||
    duration.duration === undefined ||
    duration.rest.length > 0
  ) {
    return undefined;
  }

  return {
    effect: {
      type: "cannotBecomeActive",
      target: thatCharacterSavedTarget,
      duration: duration.duration,
    },
    evidence: [
      "instruction:preventActivation",
      ...reference.evidence,
      ...duration.evidence,
    ],
    rest: "",
  };
};

export const parsePreventOpponentCharactersRefreshInstruction: InstructionParser =
  (input) => {
    const parsedTarget = parseOpponentRefreshLockTarget(input.text);
    if (parsedTarget === undefined) {
      return undefined;
    }

    const actionMatch = /^will not become active\s+(?<rest>.*)$/i.exec(
      parsedTarget.rest,
    );
    const durationText = actionMatch?.groups?.["rest"];
    if (durationText === undefined) {
      return undefined;
    }

    const duration = parseOpponentNextRefreshPhaseDuration({
      text: durationText,
    });
    if (
      duration === undefined ||
      duration.duration === undefined ||
      duration.rest.length > 0
    ) {
      return undefined;
    }

    return {
      effect: {
        type: "cannotBecomeActive",
        target: parsedTarget.target,
        duration: duration.duration,
      },
      evidence: [
        "instruction:preventActivation",
        ...parsedTarget.evidence,
        ...duration.evidence,
      ],
      rest: "",
    };
  };

const parseOpponentRefreshLockTarget = (
  text: string,
):
  | {
      readonly target: Target;
      readonly evidence: readonly PrimitiveEvidence[];
      readonly rest: string;
    }
  | undefined => {
  const cardinality = parseUpToCardinality({ text });
  if (cardinality !== undefined) {
    const target = parseOpponentCharactersTarget({ text: cardinality.rest });
    if (target === undefined) {
      return undefined;
    }
    const filter: CardFilter = target.filter ?? { categories: ["character"] };
    return {
      target: {
        type: "choose",
        request: {
          timing: "onResolution",
          chooser: "self",
          player: "opponent",
          zone: "characterArea",
          filter,
          min: cardinality.cardinality.min,
          max: cardinality.cardinality.max,
          allowFewerIfUnavailable: true,
          visibility: "public",
        },
      },
      evidence: [
        ...cardinality.evidence,
        "chooser:self:upTo",
        ...target.evidence,
      ],
      rest: target.rest,
    };
  }

  const allTarget = parseAllFieldTarget({ text });
  if (
    allTarget === undefined ||
    allTarget.target.type !== "all" ||
    allTarget.target.player !== "opponent" ||
    allTarget.target.zone !== "characterArea" ||
    allTarget.target.filter?.categories?.[0] !== "character"
  ) {
    return undefined;
  }
  return {
    target: {
      type: "all",
      player: "opponent",
      zone: "characterArea",
      filter: allTarget.target.filter ?? { categories: ["character"] },
    },
    evidence: [
      "cardinality:all",
      "player:opponent",
      "target:opponentCharacters",
      ...allTarget.evidence.filter(
        (evidence) =>
          evidence !== "cardinality:all" &&
          evidence !== "player:opponent" &&
          evidence !== "zone:characterArea",
      ),
    ],
    rest: allTarget.rest.trim(),
  };
};

export const parseYourLeaderPowerOpponentNextEndInstruction: InstructionParser =
  (input) => {
    const target = parseYourLeaderTarget(input);
    if (target === undefined || target.target === undefined) {
      return undefined;
    }

    const actionMatch = /^gains\s+(?<rest>.*)$/i.exec(target.rest);
    const modifierText = actionMatch?.groups?.["rest"];
    if (modifierText === undefined) {
      return undefined;
    }

    const modifier = parsePositivePowerModifier({ text: modifierText });
    if (modifier === undefined) {
      return undefined;
    }

    const duration = parseOpponentNextEndPhaseDuration({
      text: modifier.rest,
    });
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
