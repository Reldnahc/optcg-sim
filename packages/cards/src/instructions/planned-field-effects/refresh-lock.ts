import type { CardFilter, Target } from "@optcg/types";

import { parseUpToCardinality } from "../../cardinality/index.js";
import {
  parseOpponentNextEndPhaseDuration,
  parseOpponentNextRefreshPhaseDuration,
  parseThisTurnDuration,
} from "../../durations/index.js";
import { parseThatCharacterReference } from "../../references/index.js";
import {
  parseAllFieldTarget,
  parseOpponentCharactersTarget,
} from "../../targets/index.js";
import type { InstructionParser, PrimitiveEvidence } from "../../types.js";
import { buildProtectionEffectWithTarget } from "../protection/builders.js";
import { thatCharacterSavedTarget } from "./shared.js";

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
    "target:opponentRestedCards",
    "duration:opponentNextRefreshPhase",
  ],
} as const;

export const preventOpponentCharactersRestPrimitive = {
  primitiveId: "instruction:giveProtection",
  childPrimitiveIds: [
    "cardinality:upTo",
    "target:opponentCharacters",
    "protectionProcess:rest",
    "duration:opponentNextEndPhase",
    "duration:thisTurn",
  ],
} as const;

export const parsePreventThatCharacterRefreshInstruction: InstructionParser = (
  input,
) => {
  const reference = parseThatCharacterReference(input);
  if (reference === undefined) {
    return undefined;
  }

  const durationText = /^will not become active\s+(?<rest>.*)$/i.exec(
    reference.rest,
  )?.groups?.["rest"];
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

    const durationText = /^will not become active\s+(?<rest>.*)$/i.exec(
      parsedTarget.rest,
    )?.groups?.["rest"];
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

export const parsePreventOpponentCharactersRestInstruction: InstructionParser =
  (input) => {
    const parsedTarget = parseOpponentRefreshLockTarget(input.text);
    if (parsedTarget === undefined) {
      return undefined;
    }

    const durationText = /^cannot be rested\s+(?<rest>.*)$/i.exec(
      parsedTarget.rest,
    )?.groups?.["rest"];
    if (durationText === undefined) {
      return undefined;
    }

    const duration =
      parseOpponentNextEndPhaseDuration({
        text: durationText,
      }) ??
      parseThisTurnDuration({
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
      effect: buildProtectionEffectWithTarget({
        duration: duration.duration,
        process: "rest",
        sourceCardCategories: undefined,
        sourceKind: "cardEffect",
        sourceControllerRelation: "opponentControlled",
        target: parsedTarget.target,
      }),
      evidence: [
        "instruction:giveProtection",
        ...parsedTarget.evidence,
        "protectionProcess:rest",
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
    const restedCards = parseOpponentRestedCardsRefreshLockTarget(
      cardinality.rest,
      cardinality.cardinality.min,
      cardinality.cardinality.max,
    );
    if (restedCards !== undefined) {
      return {
        target: restedCards.target,
        evidence: [
          ...cardinality.evidence,
          "chooser:self:upTo",
          ...restedCards.evidence,
        ],
        rest: restedCards.rest,
      };
    }
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

const parseOpponentRestedCardsRefreshLockTarget = (
  text: string,
  min: number,
  max: number,
):
  | {
      readonly evidence: readonly PrimitiveEvidence[];
      readonly rest: string;
      readonly target: Target;
    }
  | undefined => {
  const match = /^of your opponent's rested cards?\b\s*(?<rest>.*)$/iu.exec(
    text,
  );
  if (match === null) {
    return undefined;
  }
  return {
    target: {
      type: "chooseFromZones",
      request: {
        timing: "onResolution",
        chooser: "self",
        player: "opponent",
        zones: ["leaderArea", "characterArea", "stageArea", "costArea"],
        filter: {
          categories: ["leader", "character", "stage", "don"],
          state: "rested",
        },
        min,
        max,
        allowFewerIfUnavailable: true,
        visibility: "public",
      },
    },
    evidence: [
      "target:opponentRestedCards",
      "player:opponent",
      "zone:leaderArea",
      "zone:characterArea",
      "zone:stageArea",
      "zone:costArea",
      "filter:category:leader",
      "filter:category:character",
      "filter:category:stage",
      "filter:category:don",
      "filter:state:rested",
    ],
    rest: match.groups?.["rest"]?.trim() ?? "",
  };
};
