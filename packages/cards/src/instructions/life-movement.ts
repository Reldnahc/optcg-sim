import type { DynamicNumberValue, SelectionId } from "@optcg/types";

import { parseUpToCardinality } from "../cardinality/index.js";
import { parseCardFilterPredicates } from "../filters/index.js";
import {
  parsePrimitivePattern,
  type PrimitivePatternDefinition,
} from "../primitive-patterns.js";
import type {
  InstructionParseResult,
  InstructionParser,
  PrimitiveEvidence,
} from "../types.js";

const handToLifeSelection =
  "handSelection:self-hand-to-life-placement" as SelectionId;
const handOrTrashToLifeSelection =
  "cardSelection:self-hand-or-trash-to-life-placement" as SelectionId;
const opponentLifeTrashSelection =
  "lifeSelection:opponent-life-to-trash" as SelectionId;

export const lifeMovementPrimitive: PrimitivePatternDefinition<InstructionParseResult> =
  {
    primitiveId: "instruction:moveCards",
    matches: [
      {
        id: "add-up-to-n-cards-from-deck-top-to-life-top",
        pattern:
          /^add (?<upTo>up to )?(?<count>[1-9]\d*) cards? from the top of your deck to the top of your Life cards(?<faceUp> face-up)?\.?$/i,
        build: (groups) => ({
          effect: {
            type: "moveCards",
            count: Number.parseInt(groups["count"] ?? "", 10),
            from: { player: "self", zone: "deck", position: "top" },
            to: { player: "self", zone: "life", position: "top" },
            order: "original",
            ...(groups["upTo"] === undefined ? {} : { min: 0 }),
            ...(groups["faceUp"] === undefined
              ? {}
              : { destinationFaceUp: true }),
          },
          evidence: [
            "instruction:moveCards",
            ...(groups["upTo"] === undefined
              ? []
              : (["cardinality:upTo"] as const)),
            "count:positiveInteger",
            "player:self",
            "zone:deck",
            "position:top",
            "destination:life",
            "order:original",
          ],
          rest: "",
        }),
      },
      {
        id: "add-up-to-n-cards-from-opponent-life-top-to-owner-hand",
        pattern:
          /^add up to (?<count>[1-9]\d*) cards? from the top of your opponent's Life cards to the owner's hand\.?$/i,
        build: (groups) => ({
          effect: {
            type: "moveCards",
            min: 0,
            count: Number.parseInt(groups["count"] ?? "", 10),
            from: { player: "opponent", zone: "life", position: "top" },
            to: { player: "owner", zone: "hand" },
            order: "original",
          },
          evidence: [
            "instruction:moveCards",
            "cardinality:upTo",
            "count:positiveInteger",
            "player:opponent",
            "zone:life",
            "position:top",
            "destination:ownerHand",
            "order:original",
          ],
          rest: "",
        }),
      },
      {
        id: "opponent-adds-n-cards-from-life-top-to-hand",
        pattern:
          /^your opponent adds (?<count>[1-9]\d*) cards? from the top of their Life cards to their hand\.?$/i,
        build: (groups) => ({
          effect: {
            type: "moveCards",
            count: Number.parseInt(groups["count"] ?? "", 10),
            from: { player: "opponent", zone: "life", position: "top" },
            to: { player: "opponent", zone: "hand" },
            order: "original",
          },
          evidence: [
            "instruction:moveCards",
            "count:positiveInteger",
            "player:opponent",
            "zone:life",
            "position:top",
            "destination:hand",
            "order:original",
          ],
          rest: "",
        }),
      },
      {
        id: "trash-n-cards-from-top-of-life",
        pattern:
          /^trash (?<count>[1-9]\d*) cards? from the top of your Life cards\.?$/i,
        build: (groups) => ({
          effect: {
            type: "moveCards",
            count: Number.parseInt(groups["count"] ?? "", 10),
            from: { player: "self", zone: "life", position: "top" },
            to: { player: "self", zone: "trash" },
            order: "original",
          },
          evidence: [
            "instruction:moveCards",
            "count:positiveInteger",
            "player:self",
            "zone:life",
            "position:top",
            "destination:trash",
            "order:original",
          ],
          rest: "",
        }),
      },
      {
        id: "trash-life-top-until-self-life-count",
        pattern:
          /^trash cards from the top of your Life cards until you have (?<threshold>[1-9]\d*) Life cards?\.?$/i,
        build: (groups) => {
          const threshold = Number.parseInt(groups["threshold"] ?? "", 10);
          const count: DynamicNumberValue = {
            type: "countMatchingZoneCards",
            player: "self",
            zone: "life",
            per: 1,
            multiplier: 1,
            offset: -threshold,
            minimum: 0,
          };
          return {
            effect: {
              type: "moveCards",
              count,
              from: { player: "self", zone: "life", position: "top" },
              to: { player: "self", zone: "trash" },
              order: "original",
            },
            evidence: [
              "instruction:moveCards",
              "valueSource:lifeCount:self",
              "valueTransform:offset",
              "valueTransform:minimum",
              "player:self",
              "zone:life",
              "position:top",
              "destination:trash",
              "order:original",
            ],
            rest: "",
          };
        },
      },
      {
        id: "trash-n-cards-from-opponent-life-top",
        pattern:
          /^trash (?<upTo>up to )?(?<count>[1-9]\d*) cards? from the top of your opponent's Life cards\.?$/i,
        build: (groups) => ({
          effect: {
            type: "moveCards",
            count: Number.parseInt(groups["count"] ?? "", 10),
            from: { player: "opponent", zone: "life", position: "top" },
            to: { player: "opponent", zone: "trash" },
            order: "original",
            ...(groups["upTo"] === undefined ? {} : { min: 0 }),
          },
          evidence: [
            "instruction:moveCards",
            ...(groups["upTo"] === undefined
              ? []
              : (["cardinality:upTo"] as const)),
            "count:positiveInteger",
            "player:opponent",
            "zone:life",
            "position:top",
            "destination:trash",
            "order:original",
          ],
          rest: "",
        }),
      },
      {
        id: "trash-n-cards-from-opponent-life-selection",
        pattern:
          /^trash (?<upTo>up to )?(?<count>[1-9]\d*) (?:(?:cards? )?from |of )?your opponent's Life cards\.?$/i,
        build: (groups) => {
          const count = Number.parseInt(groups["count"] ?? "", 10);
          const min = groups["upTo"] === undefined ? count : 0;
          return {
            effect: {
              type: "sequence",
              effects: [
                {
                  connector: "always",
                  saveResultAs: opponentLifeTrashSelection,
                  effect: {
                    type: "selectCards",
                    zone: "life",
                    player: "opponent",
                    chooser: "self",
                    min,
                    max: count,
                    saveAs: opponentLifeTrashSelection,
                    visibility: "chooserOnly",
                  },
                },
                {
                  connector: "ifPossible",
                  effect: {
                    type: "moveSelected",
                    selection: opponentLifeTrashSelection,
                    from: "life",
                    to: "trash",
                  },
                },
              ],
            },
            evidence: [
              "instruction:selectCards",
              "instruction:moveSelected",
              ...(groups["upTo"] === undefined
                ? []
                : (["cardinality:upTo"] as const)),
              "count:positiveInteger",
              "player:opponent",
              "zone:life",
              "destination:trash",
              ...(groups["upTo"] === undefined
                ? []
                : (["chooser:self:upTo"] as const)),
              "composition:selectThenMove",
            ],
            rest: "",
          };
        },
      },
      {
        id: "trash-n-cards-from-top-of-each-players-life",
        pattern:
          /^trash (?<count>[1-9]\d*) cards? from the top of each of your and your opponent's Life cards\.?$/i,
        build: (groups) => {
          const count = Number.parseInt(groups["count"] ?? "", 10);
          return {
            effect: {
              type: "sequence",
              effects: [
                {
                  connector: "always",
                  effect: {
                    type: "moveCards",
                    count,
                    from: { player: "self", zone: "life", position: "top" },
                    to: { player: "self", zone: "trash" },
                    order: "original",
                  },
                },
                {
                  connector: "then",
                  effect: {
                    type: "moveCards",
                    count,
                    from: {
                      player: "opponent",
                      zone: "life",
                      position: "top",
                    },
                    to: { player: "opponent", zone: "trash" },
                    order: "original",
                  },
                },
              ],
            },
            evidence: [
              "instruction:moveCards",
              "expression:sequence",
              "count:positiveInteger",
              "player:self",
              "player:opponent",
              "zone:life",
              "position:top",
              "destination:trash",
              "order:original",
            ],
            rest: "",
          };
        },
      },
      {
        id: "trash-all-matching-face-up-life",
        pattern: /^trash all your face-up Life cards\.?$/i,
        build: () => ({
          effect: {
            type: "moveMatchingLifeCards",
            player: "self",
            matcher: { faceUp: true },
            to: { player: "self", zone: "trash" },
            order: "original",
          },
          evidence: [
            "instruction:moveCards",
            "cardinality:all",
            "player:self",
            "zone:life",
            "visibility:faceUp",
            "destination:trash",
            "order:original",
          ],
          rest: "",
        }),
      },
      {
        id: "add-n-cards-from-life-to-hand",
        pattern:
          /^add (?<count>[1-9]\d*) cards? from the (?<position>top|bottom|top or bottom) of your Life cards to your hand\.?$/i,
        build: (groups) => {
          const position = parseMatchedLifePosition(groups["position"]);
          const count = Number.parseInt(groups["count"] ?? "", 10);
          return {
            effect: lifeToHandBody(count, position),
            evidence: [
              "instruction:moveCards",
              "count:positiveInteger",
              "player:self",
              "zone:life",
              ...lifePositionEvidence(position),
              "destination:hand",
              "order:original",
              ...(position === "topOrBottom"
                ? (["composition:chooseOne"] as const)
                : []),
            ],
            rest: "",
          };
        },
      },
    ],
  };

export const parseLifeMovementInstruction: InstructionParser = (input) => {
  const handToLife = parseHandToLifeInstruction(input);
  if (handToLife !== undefined) {
    return handToLife;
  }

  return parsePrimitivePattern(input, lifeMovementPrimitive);
};

function parseMatchedLifePosition(
  text: string | undefined,
): "top" | "bottom" | "topOrBottom" {
  const normalized = text?.toLowerCase();
  if (normalized === "top" || normalized === "bottom") {
    return normalized;
  }
  if (normalized === "top or bottom") {
    return "topOrBottom";
  }
  throw new Error("matched Life position group was not recognized");
}

function lifePositionEvidence(
  position: "top" | "bottom" | "topOrBottom",
): readonly PrimitiveEvidence[] {
  if (position === "topOrBottom") {
    return ["position:top", "position:bottom"];
  }
  return [position === "top" ? "position:top" : "position:bottom"];
}

function lifeToHandMove(
  count: number,
  position: "top" | "bottom",
): Extract<InstructionParseResult["effect"], { type: "moveCards" }> {
  return {
    type: "moveCards",
    count,
    from: { player: "self", zone: "life", position },
    to: { player: "self", zone: "hand" },
    order: "original",
  };
}

function lifeToHandBody(
  count: number,
  position: "top" | "bottom" | "topOrBottom",
): InstructionParseResult["effect"] {
  if (position !== "topOrBottom") {
    return lifeToHandMove(count, position);
  }
  return {
    type: "choice",
    chooser: "self",
    min: 1,
    max: 1,
    options: [
      {
        id: "life-to-hand:top",
        label: "Top of Life",
        effect: lifeToHandMove(count, "top"),
      },
      {
        id: "life-to-hand:bottom",
        label: "Bottom of Life",
        effect: lifeToHandMove(count, "bottom"),
      },
    ],
  };
}

const parseHandToLifeInstruction: InstructionParser = (input) => {
  const revealMatch =
    /^reveal\s+(?<rest>.+?)\s+from your hand and add it to the top of your Life cards(?<faceDown> face-down)?\.?$/iu.exec(
      input.text,
    );
  const afterReveal = revealMatch?.groups?.["rest"];
  if (afterReveal !== undefined) {
    const cardinality = parseUpToCardinality({ text: afterReveal });
    if (cardinality === undefined) {
      return undefined;
    }
    const predicates = parseCardFilterPredicates({ text: cardinality.rest });
    if (predicates === undefined || predicates.rest.trim().length > 0) {
      return undefined;
    }

    return buildHandToLifeInstruction({
      cardinality,
      filter: predicates.filter,
      filterEvidence: predicates.evidence,
      destinationFaceUp: false,
      selectionVisibility: "bothPlayers",
    });
  }

  const addMatch = /^add\s+(?<rest>.+)$/i.exec(input.text);
  const afterAdd = addMatch?.groups?.["rest"];
  if (afterAdd === undefined) {
    return undefined;
  }

  const cardinality = parseUpToCardinality({ text: afterAdd });
  if (cardinality === undefined) {
    return undefined;
  }
  const handOrTrashToLife = parseHandOrTrashToLifeInstruction({
    text: cardinality.rest,
    cardinality,
  });
  if (handOrTrashToLife !== undefined) {
    return handOrTrashToLife;
  }
  if (
    /^cards? from your hand to the top of your Life cards\.?$/i.test(
      cardinality.rest,
    )
  ) {
    return buildHandToLifeInstruction({
      cardinality,
      filterEvidence: [],
      destinationFaceUp: false,
      selectionVisibility: "chooserOnly",
    });
  }

  const filtered =
    /^(?<filter>.+?) from your hand to the top of your Life cards(?<faceUp> face-up)?\.?$/iu.exec(
      cardinality.rest,
    );
  const groups = filtered?.groups;
  const filterText = groups?.["filter"];
  if (groups === undefined || filterText === undefined) {
    return undefined;
  }
  const predicates = parseCardFilterPredicates({ text: filterText });
  if (predicates === undefined || predicates.rest.trim().length > 0) {
    return undefined;
  }

  return buildHandToLifeInstruction({
    cardinality,
    filter: predicates.filter,
    filterEvidence: predicates.evidence,
    destinationFaceUp: groups["faceUp"] !== undefined,
    selectionVisibility: "chooserOnly",
  });
};

function parseHandOrTrashToLifeInstruction({
  cardinality,
  text,
}: {
  readonly cardinality: NonNullable<ReturnType<typeof parseUpToCardinality>>;
  readonly text: string;
}): InstructionParseResult | undefined {
  const match =
    /^(?<filter>.+?) from your hand or trash to the (?<position>top|bottom) of your Life cards(?<faceUp> face-up)?\.?$/iu.exec(
      text,
    );
  const filterText = match?.groups?.["filter"];
  const position = match?.groups?.["position"];
  if (
    filterText === undefined ||
    (position !== "top" && position !== "bottom")
  ) {
    return undefined;
  }
  const predicates = parseCardFilterPredicates({ text: filterText });
  if (predicates === undefined || predicates.rest.trim().length > 0) {
    return undefined;
  }

  const destinationFaceUp = match?.groups?.["faceUp"] !== undefined;
  return {
    effect: {
      type: "sequence",
      effects: [
        {
          connector: "always",
          saveResultAs: handOrTrashToLifeSelection,
          effect: {
            type: "selectCards",
            zones: ["hand", "trash"],
            player: "self",
            chooser: "self",
            min: cardinality.cardinality.min,
            max: cardinality.cardinality.max,
            filter: predicates.filter,
            saveAs: handOrTrashToLifeSelection,
            visibility: "chooserOnly",
          },
        },
        {
          connector: "ifPossible",
          effect: {
            type: "moveSelected",
            selection: handOrTrashToLifeSelection,
            from: "currentZone",
            to: "life",
            position,
            ...(destinationFaceUp ? { destinationFaceUp: true } : {}),
          },
        },
      ],
    },
    evidence: [
      "instruction:selectCards",
      "instruction:moveSelected",
      ...cardinality.evidence,
      "player:self",
      "zone:hand",
      "zone:trash",
      "destination:life",
      position === "top" ? "position:top" : "position:bottom",
      ...(destinationFaceUp ? (["destination:faceUp"] as const) : []),
      ...predicates.evidence,
      "chooser:self:upTo",
      "composition:selectThenMove",
    ],
    rest: "",
  };
}

function buildHandToLifeInstruction({
  cardinality,
  destinationFaceUp,
  filter,
  filterEvidence,
  selectionVisibility,
}: {
  readonly cardinality: NonNullable<ReturnType<typeof parseUpToCardinality>>;
  readonly destinationFaceUp: boolean;
  readonly filter?: NonNullable<
    ReturnType<typeof parseCardFilterPredicates>
  >["filter"];
  readonly filterEvidence: readonly PrimitiveEvidence[];
  readonly selectionVisibility: "bothPlayers" | "chooserOnly";
}): InstructionParseResult {
  return {
    effect: {
      type: "sequence",
      effects: [
        {
          connector: "always",
          saveResultAs: handToLifeSelection,
          effect: {
            type: "selectCards",
            zone: "hand",
            player: "self",
            chooser: "self",
            min: cardinality.cardinality.min,
            max: cardinality.cardinality.max,
            saveAs: handToLifeSelection,
            visibility: selectionVisibility,
            ...(filter === undefined ? {} : { filter }),
          },
        },
        {
          connector: "ifPossible",
          effect: {
            type: "moveSelected",
            selection: handToLifeSelection,
            from: "hand",
            to: "life",
            position: "top",
            ...(destinationFaceUp ? { destinationFaceUp: true } : {}),
          },
        },
      ],
    },
    evidence: [
      "instruction:selectCards",
      "instruction:moveSelected",
      ...cardinality.evidence,
      "player:self",
      "zone:hand",
      "destination:life",
      "position:top",
      ...(destinationFaceUp ? ["visibility:faceUp" as const] : []),
      ...filterEvidence,
      ...(selectionVisibility === "bothPlayers"
        ? (["reveal:bothPlayers"] as const)
        : []),
      "chooser:self:upTo",
      "composition:selectThenMove",
    ],
    rest: "",
  };
}
