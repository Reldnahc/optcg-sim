import type { Effect, Target } from "@optcg/types";

import { parseUpToCardinality } from "../cardinality/index.js";
import { parseCardFilterPredicates } from "../filters/index.js";
import type { InstructionParser } from "../types.js";

const returnSelectionId = "selected:return-to-owner-hand";

export const parseReturnToOwnerHandInstruction: InstructionParser = (input) => {
  const match = /^return\s+(?<rest>.+)\s+to the owner's hand\.?$/iu.exec(
    input.text,
  );
  const rest = match?.groups?.["rest"];
  if (rest === undefined) {
    return undefined;
  }

  const cardinality = parseUpToCardinality({ text: rest });
  if (cardinality === undefined) {
    return undefined;
  }

  const predicates = parseCardFilterPredicates(
    { text: cardinality.rest },
    { powerSemantics: "current" },
  );
  if (predicates === undefined || predicates.rest.length > 0) {
    return undefined;
  }

  return {
    effect: selectThenReturnToOwnerHand(
      "anyPlayer",
      cardinality.cardinality.min,
      cardinality.cardinality.max,
      predicates.filter,
    ),
    evidence: [
      "instruction:returnToOwnerHand",
      ...cardinality.evidence,
      "player:any",
      ...predicates.evidence,
      "destination:ownerHand",
      "composition:selectThenApply",
    ],
    rest: "",
  };
};

export function selectThenReturnToOwnerHand(
  player: "self" | "opponent" | "anyPlayer",
  min: number,
  max: number,
  filter: NonNullable<Extract<Target, { type: "choose" }>["request"]["filter"]>,
): Effect {
  return {
    type: "sequence",
    effects: [
      {
        id: "select:return-to-owner-hand",
        connector: "always",
        saveResultAs: returnSelectionId,
        effect: {
          type: "selectTargets",
          request: {
            timing: "onResolution",
            chooser: "self",
            player,
            zone: "characterArea",
            min,
            max,
            allowFewerIfUnavailable: true,
            visibility: "public",
            filter,
          },
        },
      },
      {
        connector: "then",
        effect: {
          type: "bounce",
          destination: "hand",
          target: {
            type: "savedFieldObject",
            binding: {
              family: "selectedTargets",
              saveResultAs: returnSelectionId,
            },
            zone: "characterArea",
            player,
            visibility: "publicOnly",
            onFailure: "failClosed",
          },
        },
      },
    ],
  };
}
