import type { Effect, Target } from "@optcg/types";

import { parseUpToCardinality } from "../cardinality/index.js";
import { parseCardFilterPredicates } from "../filters/index.js";
import { parseOpponentCharactersTarget } from "../targets/index.js";
import type { InstructionParser, PrimitiveEvidence } from "../types.js";

const ownerDeckBottomSelectionId = "selected:owner-deck-bottom";

type CharacterFilter = NonNullable<
  Extract<Target, { type: "choose" }>["request"]["filter"]
>;

const savedOwnerDeckBottomTarget = (player: "opponent" | "anyPlayer") =>
  ({
    type: "savedFieldObject",
    binding: {
      family: "selectedTargets",
      saveResultAs: ownerDeckBottomSelectionId,
    },
    zone: "characterArea",
    player,
    visibility: "publicOnly",
    onFailure: "failClosed",
  }) as const;

const selectThenPlaceAtOwnerDeckBottom = (
  player: "opponent" | "anyPlayer",
  min: number,
  max: number,
  filter: CharacterFilter,
): Effect => ({
  type: "sequence",
  effects: [
    {
      id: "select:owner-deck-bottom",
      connector: "always",
      saveResultAs: ownerDeckBottomSelectionId,
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
        destination: "deckBottom",
        target: savedOwnerDeckBottomTarget(player),
      },
    },
  ],
});

const parseAnyCharacterTarget = (text: string) => {
  const predicates = parseCardFilterPredicates(
    { text },
    { powerSemantics: "current" },
  );
  if (
    predicates === undefined ||
    predicates.filter.categories?.[0] !== "character"
  ) {
    return undefined;
  }

  return {
    player: "anyPlayer" as const,
    filter: predicates.filter,
    evidence: [
      "player:any",
      ...predicates.evidence,
    ] as readonly PrimitiveEvidence[],
    rest: predicates.rest.trim(),
  };
};

const parseOwnerDeckBottomTarget = (text: string) => {
  const opponent = parseOpponentCharactersTarget({ text });
  if (opponent !== undefined) {
    return {
      player: "opponent" as const,
      filter: opponent.filter ?? { categories: ["character"] },
      evidence: opponent.evidence,
      rest: opponent.rest.trim(),
    };
  }

  return parseAnyCharacterTarget(text);
};

export const parsePlaceAtOwnerDeckBottomInstruction: InstructionParser = (
  input,
) => {
  const match =
    /^place\s+(?<selection>.+?)\s+at the bottom of the owner's deck(?<order>\s+in any order)?\.?$/iu.exec(
      input.text,
    );
  const selectionText = match?.groups?.["selection"];
  if (selectionText === undefined) {
    return undefined;
  }

  const cardinality = parseUpToCardinality({ text: selectionText });
  if (cardinality === undefined) {
    return undefined;
  }

  const target = parseOwnerDeckBottomTarget(cardinality.rest);
  if (target === undefined || target.rest.length > 0) {
    return undefined;
  }

  const orderEvidence: readonly PrimitiveEvidence[] =
    match?.groups?.["order"] === undefined ? [] : ["order:anyOrder"];

  return {
    effect: selectThenPlaceAtOwnerDeckBottom(
      target.player,
      cardinality.cardinality.min,
      cardinality.cardinality.max,
      target.filter,
    ),
    evidence: [
      "instruction:moveSelected",
      ...cardinality.evidence,
      "chooser:self:upTo",
      ...target.evidence,
      "destination:deck",
      "position:bottom",
      ...orderEvidence,
      "composition:selectThenApply",
    ],
    rest: "",
  };
};
