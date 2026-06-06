import { parseUpToCardinality } from "../../cardinality/index.js";
import { parseOpponentNextEndPhaseDuration } from "../../durations/index.js";
import { parseOpponentCharactersTarget } from "../../targets/index.js";
import type { InstructionParser } from "../../types.js";
import {
  thatCharacterSavedTarget,
  thatCharacterSelectionId,
} from "./shared.js";

export const preventOpponentCharactersAttackPrimitive = {
  primitiveId: "instruction:preventActivation",
  childPrimitiveIds: [
    "cardinality:upTo",
    "target:opponentCharacters",
    "duration:opponentNextEndPhase",
  ],
} as const;

export const parsePreventOpponentCharactersAttackInstruction: InstructionParser =
  (input) => {
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

    const duration = parseOpponentNextEndPhaseDuration({
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
        type: "sequence",
        effects: [
          {
            id: "select:cannot-attack",
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
              type: "cannotAttack",
              target: thatCharacterSavedTarget,
              duration: duration.duration,
            },
          },
        ],
      },
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
