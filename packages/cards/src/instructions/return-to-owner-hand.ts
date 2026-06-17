import type { Effect, Target } from "@optcg/types";

import {
  parseExactCardinality,
  parseUpToCardinality,
} from "../cardinality/index.js";
import { parseCardFilterPredicates } from "../filters/index.js";
import {
  parseOpponentFieldTarget,
  parseYourCharactersTarget,
} from "../targets/index.js";
import type { InstructionParser, PrimitiveEvidence } from "../types.js";

export const returnToOwnerHandSelectionId = "selected:return-to-owner-hand";

export const parseReturnToOwnerHandInstruction: InstructionParser = (input) => {
  const opponentChosen = parseOpponentChosenReturnToOwnerHand(input.text);
  if (opponentChosen !== undefined) {
    return opponentChosen;
  }

  const match = /^return\s+(?<rest>.+)\s+to the owner's hand\.?$/iu.exec(
    input.text,
  );
  const rest = match?.groups?.["rest"];
  if (rest === undefined) {
    return undefined;
  }

  const cardinality = parseReturnCardinality(rest);
  if (cardinality === undefined) {
    return undefined;
  }

  const opponentTarget = parseOpponentFieldTarget({ text: cardinality.rest });
  if (
    opponentTarget !== undefined &&
    (opponentTarget.rest.length === 0 || opponentTarget.rest === ".")
  ) {
    const category = opponentTarget.filter?.categories?.[0];
    return {
      effect: selectThenReturnToOwnerHand(
        "opponent",
        cardinality.min,
        cardinality.max,
        opponentTarget.filter ?? { categories: ["character"] },
        category === "stage" ? "stageArea" : "characterArea",
      ),
      evidence: [
        "instruction:returnToOwnerHand",
        ...cardinality.evidence,
        ...opponentTarget.evidence,
        "destination:ownerHand",
        "composition:selectThenApply",
      ],
      rest: "",
    };
  }

  const selfCharacterTarget = parseYourCharactersTarget({
    text: cardinality.rest,
  });
  if (
    selfCharacterTarget !== undefined &&
    (selfCharacterTarget.rest.length === 0 || selfCharacterTarget.rest === ".")
  ) {
    return {
      effect: selectThenReturnToOwnerHand(
        "self",
        cardinality.min,
        cardinality.max,
        selfCharacterTarget.filter ?? { categories: ["character"] },
        "characterArea",
      ),
      evidence: [
        "instruction:returnToOwnerHand",
        ...cardinality.evidence,
        ...selfCharacterTarget.evidence,
        "destination:ownerHand",
        "composition:selectThenApply",
      ],
      rest: "",
    };
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
      cardinality.min,
      cardinality.max,
      predicates.filter,
      predicates.filter.categories?.[0] === "stage"
        ? "stageArea"
        : "characterArea",
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
  zone: "characterArea" | "stageArea" = "characterArea",
  chooser: "self" | "opponent" = "self",
): Effect {
  return {
    type: "sequence",
    effects: [
      {
        id: "select:return-to-owner-hand",
        connector: "always",
        saveResultAs: returnToOwnerHandSelectionId,
        effect: {
          type: "selectTargets",
          request: {
            timing: "onResolution",
            chooser,
            player,
            zone,
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
              saveResultAs: returnToOwnerHandSelectionId,
            },
            zone,
            player,
            visibility: "publicOnly",
            onFailure: "failClosed",
          },
        },
      },
    ],
  };
}

const parseOpponentChosenReturnToOwnerHand = (
  text: string,
): ReturnType<InstructionParser> => {
  const match =
    /^your opponent returns\s+(?<selection>.+)\s+to the owner's hand\.?$/iu.exec(
      text,
    );
  const selectionText = match?.groups?.["selection"];
  if (selectionText === undefined) {
    return undefined;
  }

  const cardinality = parseReturnCardinality(selectionText);
  if (cardinality === undefined) {
    return undefined;
  }

  const targetText = cardinality.rest
    .replace(/^of their\s+/iu, "")
    .replace(/^their\s+/iu, "")
    .trim();
  const predicates = parseCardFilterPredicates(
    { text: targetText },
    { powerSemantics: "current" },
  );
  if (
    predicates === undefined ||
    predicates.rest.length > 0 ||
    predicates.filter.categories?.[0] !== "character"
  ) {
    return undefined;
  }

  return {
    effect: selectThenReturnToOwnerHand(
      "opponent",
      cardinality.min,
      cardinality.max,
      predicates.filter,
      "characterArea",
      "opponent",
    ),
    evidence: [
      "instruction:returnToOwnerHand",
      ...cardinality.evidence,
      "chooser:opponent",
      "player:opponent",
      ...predicates.evidence,
      "destination:ownerHand",
      "composition:selectThenApply",
    ],
    rest: "",
  };
};

const parseReturnCardinality = (
  text: string,
):
  | {
      readonly evidence: readonly PrimitiveEvidence[];
      readonly max: number;
      readonly min: number;
      readonly rest: string;
    }
  | undefined => {
  const upTo = parseUpToCardinality({ text });
  if (upTo !== undefined) {
    return {
      evidence: upTo.evidence,
      max: upTo.cardinality.max,
      min: upTo.cardinality.min,
      rest: upTo.rest,
    };
  }

  const exact = parseExactCardinality({ text });
  if (exact === undefined) {
    return undefined;
  }
  return {
    evidence: exact.evidence,
    max: exact.count,
    min: exact.count,
    rest: exact.rest,
  };
};
