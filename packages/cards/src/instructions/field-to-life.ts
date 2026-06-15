import type { Effect, SelectionId, Target } from "@optcg/types";

import {
  parseExactCardinality,
  parseUpToCardinality,
} from "../cardinality/index.js";
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

export type FieldToLifePlacementParts = {
  readonly player: "opponent" | "anyPlayer";
  readonly count: number;
  readonly min: number;
  readonly max: number;
  readonly filter: CharacterFilter;
  readonly position: "top" | "bottom" | "topOrBottom";
  readonly faceUp?: boolean;
  readonly evidence: readonly PrimitiveEvidence[];
};

export const parseFieldToLifePlacementParts = (
  input: Pick<Parameters<InstructionParser>[0], "text">,
): FieldToLifePlacementParts | undefined => {
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
  const exactCardinality =
    cardinality === undefined
      ? parseExactCardinality({ text: selectionText })
      : undefined;
  const parsedCardinality = cardinality ?? exactCardinality;
  if (parsedCardinality === undefined) {
    return undefined;
  }

  const target = parseFieldToLifeTarget(parsedCardinality.rest);
  if (target === undefined || target.rest.length > 0) {
    return undefined;
  }

  const position = normalizePosition(positionText);
  const faceText = match.groups?.["face"]?.trim().toLowerCase();
  const faceUp = faceText === "face-up";
  const count =
    "count" in parsedCardinality
      ? parsedCardinality.count
      : parsedCardinality.cardinality.max;
  const min =
    "count" in parsedCardinality
      ? parsedCardinality.count
      : parsedCardinality.cardinality.min;
  const max =
    "count" in parsedCardinality
      ? parsedCardinality.count
      : parsedCardinality.cardinality.max;
  return {
    player: target.player,
    count,
    min,
    max,
    filter: target.filter,
    position,
    ...(faceText === undefined ? {} : { faceUp }),
    evidence: [
      ...parsedCardinality.evidence,
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
    ],
  };
};

export const parsePlaceAtOwnerLifeInstruction: InstructionParser = (input) => {
  const parts = parseFieldToLifePlacementParts(input);
  if (parts === undefined) {
    return undefined;
  }

  return {
    effect: selectThenPlaceAtOwnerLife(
      parts.player,
      parts.min,
      parts.max,
      parts.filter,
      parts.position,
      parts.faceUp === true,
    ),
    evidence: [
      "instruction:moveSelected",
      ...parts.evidence,
      parts.min === 0 ? "chooser:self:upTo" : "chooser:self",
      "composition:selectThenApply",
    ],
    rest: "",
  };
};

const parseFieldToLifeWording = (text: string): RegExpExecArray | null =>
  /^place\s+(?<selection>.+?)\s+at the (?<position>top|bottom|top or bottom) of (?:their|your opponent's|the owner's) Life cards(?:\s+(?<face>face-(?:up|down)))?\.?$/iu.exec(
    text,
  ) ??
  /^add\s+(?<selection>.+?)\s+to the (?<position>top|bottom|top or bottom) of (?:their|your opponent's|the owner's) Life cards(?:\s+(?<face>face-(?:up|down)))?\.?$/iu.exec(
    text,
  );
