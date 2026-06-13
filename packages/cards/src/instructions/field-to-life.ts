import type { Effect, SelectionId, Target } from "@optcg/types";

import { parseUpToCardinality } from "../cardinality/index.js";
import { parseCardFilterPredicates } from "../filters/index.js";
import { parseOpponentCharactersTarget } from "../targets/index.js";
import type { InstructionParser, PrimitiveEvidence } from "../types.js";

const fieldToLifeSelectionId = "selected:field-to-life" as SelectionId &
  "selected:field-to-life";

type CharacterFilter = NonNullable<
  Extract<Target, { type: "choose" }>["request"]["filter"]
>;

const savedFieldToLifeTarget = (player: "opponent" | "anyPlayer") =>
  ({
    type: "savedFieldObject",
    binding: {
      family: "selectedTargets",
      saveResultAs: fieldToLifeSelectionId,
    },
    zone: "characterArea",
    player,
    visibility: "publicOnly",
    onFailure: "failClosed",
  }) as const;

const fieldToLifeMove = (
  player: "opponent" | "anyPlayer",
  position: "top" | "bottom",
  faceUp: boolean,
): Effect => ({
  type: "bounce",
  destination: position === "top" ? "lifeTop" : "lifeBottom",
  ...(faceUp ? { destinationFaceUp: true } : {}),
  target: savedFieldToLifeTarget(player),
});

const fieldToLifeBody = (
  player: "opponent" | "anyPlayer",
  position: "top" | "bottom" | "topOrBottom",
  faceUp: boolean,
): Effect =>
  position === "topOrBottom"
    ? {
        type: "choice",
        chooser: "self",
        min: 1,
        max: 1,
        options: [
          {
            id: "life-placement:top",
            label: "Top of Life",
            effect: fieldToLifeMove(player, "top", faceUp),
          },
          {
            id: "life-placement:bottom",
            label: "Bottom of Life",
            effect: fieldToLifeMove(player, "bottom", faceUp),
          },
        ],
      }
    : fieldToLifeMove(player, position, faceUp);

const selectThenPlaceAtOwnerLife = (
  player: "opponent" | "anyPlayer",
  min: number,
  max: number,
  filter: CharacterFilter,
  position: "top" | "bottom" | "topOrBottom",
  faceUp: boolean,
): Effect => ({
  type: "sequence",
  effects: [
    {
      id: "select:field-to-life",
      connector: "always",
      saveResultAs: fieldToLifeSelectionId,
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
      id: "place:field-to-life",
      connector: "then",
      effect: fieldToLifeBody(player, position, faceUp),
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

const parseFieldToLifeTarget = (text: string) => {
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

const normalizePosition = (text: string): "top" | "bottom" | "topOrBottom" =>
  text.toLowerCase() === "top or bottom"
    ? "topOrBottom"
    : text.toLowerCase() === "top"
      ? "top"
      : "bottom";

export const parsePlaceAtOwnerLifeInstruction: InstructionParser = (input) => {
  const match = parseFieldToLifeWording(input.text);
  if (match === null) {
    return undefined;
  }
  const selectionText = match.groups?.["selection"];
  const positionText = match.groups?.["position"];
  if (selectionText === undefined || positionText === undefined) {
    return undefined;
  }

  const cardinality = parseUpToCardinality({ text: selectionText });
  if (cardinality === undefined) {
    return undefined;
  }

  const target = parseFieldToLifeTarget(cardinality.rest);
  if (target === undefined || target.rest.length > 0) {
    return undefined;
  }

  const position = normalizePosition(positionText);
  const faceText = match.groups?.["face"]?.trim().toLowerCase();
  const faceUp = faceText === "face-up";
  return {
    effect: selectThenPlaceAtOwnerLife(
      target.player,
      cardinality.cardinality.min,
      cardinality.cardinality.max,
      target.filter,
      position,
      faceUp,
    ),
    evidence: [
      "instruction:moveSelected",
      ...cardinality.evidence,
      "chooser:self:upTo",
      ...target.evidence,
      "destination:life",
      ...(position === "topOrBottom"
        ? ([
            "position:top",
            "position:bottom",
            "composition:chooseOne",
          ] as const)
        : position === "top"
          ? (["position:top"] as const)
          : (["position:bottom"] as const)),
      ...(faceText === "face-up"
        ? (["destination:faceUp"] as const)
        : faceText === "face-down"
          ? (["destination:faceDown"] as const)
          : []),
      "composition:selectThenApply",
    ],
    rest: "",
  };
};

const parseFieldToLifeWording = (text: string): RegExpExecArray | null =>
  /^place\s+(?<selection>.+?)\s+at the (?<position>top|bottom|top or bottom) of (?:their|the owner's) Life cards(?:\s+(?<face>face-(?:up|down)))?\.?$/iu.exec(
    text,
  ) ??
  /^add\s+(?<selection>.+?)\s+to the (?<position>top|bottom|top or bottom) of (?:their|the owner's) Life cards(?:\s+(?<face>face-(?:up|down)))?\.?$/iu.exec(
    text,
  );
