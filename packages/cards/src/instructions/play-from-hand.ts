import type { CardFilter, HandSelectionId, SelectionId } from "@optcg/types";

import { parseUpToCardinality } from "../cardinality/index.js";
import { parseCardFilterPredicates } from "../filters/index.js";
import { returnToOwnerHandSelectionId } from "./return-to-owner-hand.js";
import type { InstructionParser, PrimitiveEvidence } from "../types.js";

const handPlaySelection = "handSelection:play-from-hand" as HandSelectionId;
const handOrTrashHandSelection =
  "handSelection:play-from-hand-or-trash:hand" as HandSelectionId;
const handOrTrashTrashSelection =
  "trashSelection:play-from-hand-or-trash:trash" as SelectionId;

interface QuantifiedPlayFilter {
  readonly cardinality: NonNullable<
    ReturnType<typeof parseUpToCardinality>
  >["cardinality"];
  readonly filter: CardFilter;
  readonly evidence: readonly PrimitiveEvidence[];
}

export const parsePlayFromHandInstruction: InstructionParser = (input) => {
  const handOrTrash = parsePlayFromHandOrTrashInstruction(input);
  if (handOrTrash !== undefined) {
    return handOrTrash;
  }

  const opponentPlayMatch = /^your opponent plays\s+(?<rest>.+)$/iu.exec(
    input.text,
  );
  const playMatch =
    opponentPlayMatch ?? /^Play\s+(?<rest>.+)$/iu.exec(input.text);
  const afterPlay = playMatch?.groups?.["rest"];
  if (afterPlay === undefined) {
    return undefined;
  }
  const player = opponentPlayMatch === null ? "self" : "opponent";

  const alternativeSources = parsePlayFromHandAlternativeSources(afterPlay);
  if (player === "self" && alternativeSources !== undefined) {
    return alternativeSources;
  }

  const eachFromHand = parsePlayEachFromHand(afterPlay, player);
  if (eachFromHand !== undefined) {
    return eachFromHand;
  }

  const cardinality = parseUpToCardinality({ text: afterPlay });
  if (cardinality === undefined) {
    return undefined;
  }

  const source = parsePlayFromHandSource(cardinality.rest, player);
  if (source === undefined) {
    return undefined;
  }

  return {
    effect: {
      type: "sequence",
      effects: [
        {
          id: "select:hand-play",
          connector: "always",
          saveResultAs: handPlaySelection,
          effect: {
            type: "selectCards",
            zone: "hand",
            player,
            chooser: player,
            min: cardinality.cardinality.min,
            max: cardinality.cardinality.max,
            filter: source.filter,
            saveAs: handPlaySelection,
            visibility: "chooserOnly",
          },
        },
        {
          id: "play:selected-from-hand",
          connector: "ifPossible",
          effect: {
            type: "playSelected",
            selection: handPlaySelection,
            ignoreCost: true,
            ...(player === "self" ? {} : { player }),
            ...(source.enterRested ? { enterRested: true } : {}),
          },
        },
      ],
    },
    evidence: [
      "instruction:playSelected",
      ...cardinality.evidence,
      "zone:hand",
      player === "self" ? "player:self" : "player:opponent",
      player === "self" ? "chooser:self:upTo" : "chooser:opponent",
      ...source.evidence,
      ...(source.enterRested ? ["state:rested" as const] : []),
      "composition:selectThenPlay",
    ],
    rest: "",
  };
};

const eachHandSelectionPrefix =
  "handSelection:play-each-from-hand" as HandSelectionId;

function parsePlayEachFromHand(
  text: string,
  player: "self" | "opponent",
): ReturnType<InstructionParser> {
  const sourceText = player === "self" ? "your hand" : "their hand";
  const match = new RegExp(
    `^up to 1 each of (?<names>.+?) (?<predicates>with .+?) from ${sourceText}\\.?$`,
    "iu",
  ).exec(text);
  const namesText = match?.groups?.["names"];
  const predicateTail = match?.groups?.["predicates"];
  if (namesText === undefined || predicateTail === undefined) {
    return undefined;
  }
  const names = Array.from(namesText.matchAll(/\[([^\]]+)\]/gu)).flatMap(
    (entry) => {
      const name = entry[1];
      return name === undefined ? [] : [name];
    },
  );
  if (names.length === 0) {
    return undefined;
  }
  const parts = names.map((name, index) => {
    const predicates = parseCardFilterPredicates({
      text: `[${name}] ${predicateTail}`,
    });
    if (predicates === undefined || predicates.rest.length > 0) {
      return undefined;
    }
    const selection =
      `${eachHandSelectionPrefix}:${String(index)}` as HandSelectionId;
    return {
      evidence: predicates.evidence,
      effect: playSelectedFromZone({
        selection,
        zone: "hand",
        player,
        visibility: "chooserOnly",
        filter: predicates.filter,
        min: 0,
        max: 1,
        enterRested: false,
      }),
    };
  });
  if (parts.some((part) => part === undefined)) {
    return undefined;
  }
  const definedParts = parts.filter(
    (part): part is NonNullable<typeof part> => part !== undefined,
  );
  return {
    effect: {
      type: "sequence",
      effects: definedParts.map((part, index) => ({
        connector: index === 0 ? "always" : "then",
        effect: part.effect,
      })),
    },
    evidence: [
      "instruction:playSelected",
      "expression:sequence",
      "cardinality:upTo",
      "count:positiveInteger",
      "zone:hand",
      player === "self" ? "player:self" : "player:opponent",
      player === "self" ? "chooser:self:upTo" : "chooser:opponent",
      ...definedParts.flatMap((part) => part.evidence),
      "composition:selectThenPlay",
    ],
    rest: "",
  };
}

const parsePlayFromHandAlternativeSources = (
  text: string,
): ReturnType<InstructionParser> => {
  const match =
    /^(?<left>up to [1-9]\d* .+?)\s+or\s+(?<right>up to [1-9]\d* .+ from your hand(?<rested>\s+rested)?\.?)$/iu.exec(
      text,
    );
  const leftText = match?.groups?.["left"];
  const rightText = match?.groups?.["right"];
  if (leftText === undefined || rightText === undefined) {
    return undefined;
  }

  const leftCardinality = parseUpToCardinality({ text: leftText });
  const rightCardinality = parseUpToCardinality({ text: rightText });
  if (leftCardinality === undefined || rightCardinality === undefined) {
    return undefined;
  }
  if (
    leftCardinality.cardinality.min !== rightCardinality.cardinality.min ||
    leftCardinality.cardinality.max !== rightCardinality.cardinality.max
  ) {
    return undefined;
  }

  const leftPredicates = parseCardFilterPredicates({
    text: leftCardinality.rest,
  });
  const rightSource = parsePlayFromHandSource(rightCardinality.rest);
  if (
    leftPredicates === undefined ||
    leftPredicates.rest.length > 0 ||
    rightSource === undefined
  ) {
    return undefined;
  }

  const filter: CardFilter = {
    anyOf: [leftPredicates.filter, rightSource.filter],
  };
  const cardinality = leftCardinality.cardinality;

  return {
    effect: {
      type: "sequence",
      effects: [
        {
          id: "select:hand-play",
          connector: "always",
          saveResultAs: handPlaySelection,
          effect: {
            type: "selectCards",
            zone: "hand",
            player: "self",
            chooser: "self",
            min: cardinality.min,
            max: cardinality.max,
            filter,
            saveAs: handPlaySelection,
            visibility: "chooserOnly",
          },
        },
        {
          id: "play:selected-from-hand",
          connector: "ifPossible",
          effect: {
            type: "playSelected",
            selection: handPlaySelection,
            ignoreCost: true,
            ...(rightSource.enterRested ? { enterRested: true } : {}),
          },
        },
      ],
    },
    evidence: [
      "instruction:playSelected",
      ...leftCardinality.evidence,
      "zone:hand",
      "player:self",
      "chooser:self:upTo",
      "filter:anyOf",
      ...leftPredicates.evidence,
      ...rightSource.evidence,
      ...(rightSource.enterRested ? ["state:rested" as const] : []),
      "composition:selectThenPlay",
    ],
    rest: "",
  };
};

const parsePlayFromHandOrTrashInstruction: InstructionParser = (input) => {
  const playMatch = /^Play\s+(?<rest>.+)$/i.exec(input.text);
  const afterPlay = playMatch?.groups?.["rest"];
  if (afterPlay === undefined) {
    return undefined;
  }

  const sourceMatch =
    /^(?<parts>.+) from your hand or trash(?<rested>\s+rested)?\.?$/i.exec(
      afterPlay,
    );
  if (sourceMatch === null) {
    return undefined;
  }
  const groups = sourceMatch.groups;
  if (groups === undefined) {
    return undefined;
  }
  const partsText = groups["parts"];
  if (partsText === undefined) {
    return undefined;
  }
  const parts = parseQuantifiedPlayFilters(partsText);
  if (parts === undefined) {
    return undefined;
  }
  const enterRested = groups["rested"] !== undefined;

  if (parts.connector === "and") {
    return {
      effect: {
        type: "sequence",
        effects: parts.parts.map((part, index) => ({
          connector: index === 0 ? ("always" as const) : ("then" as const),
          effect: buildHandOrTrashChoice({
            cardinality: part.cardinality,
            filter: part.filter,
            enterRested,
            selectionSuffix: String(index),
          }).effect,
        })),
      },
      evidence: [
        "instruction:playSelected",
        "expression:sequence",
        "zone:hand",
        "zone:trash",
        "player:self",
        "chooser:self:upTo",
        ...parts.parts.flatMap((part) => part.evidence),
        ...(enterRested ? ["state:rested" as const] : []),
        "composition:selectThenPlay",
        "composition:chooseOne",
      ],
      rest: "",
    };
  }

  const [part] = parts.parts;
  if (part === undefined) {
    return undefined;
  }
  const filter =
    parts.connector === "or"
      ? { anyOf: parts.parts.map((entry) => entry.filter) }
      : part.filter;
  const cardinality = part.cardinality;
  if (
    parts.connector === "or" &&
    !parts.parts.every(
      (entry) =>
        entry.cardinality.min === cardinality.min &&
        entry.cardinality.max === cardinality.max,
    )
  ) {
    return undefined;
  }
  const choice = buildHandOrTrashChoice({ cardinality, filter, enterRested });

  return {
    effect: choice.effect,
    evidence: [
      "instruction:playSelected",
      ...(parts.connector === "or" ? (["filter:anyOf"] as const) : []),
      ...parts.parts.flatMap((entry) => entry.evidence),
      "zone:hand",
      "zone:trash",
      "player:self",
      "chooser:self:upTo",
      ...(enterRested ? ["state:rested" as const] : []),
      "composition:selectThenPlay",
      "composition:chooseOne",
    ],
    rest: "",
  };
};

function parseQuantifiedPlayFilters(text: string):
  | {
      readonly connector: "single" | "or" | "and";
      readonly parts: readonly QuantifiedPlayFilter[];
    }
  | undefined {
  const hasOr = /\s+or\s+(?=up to [1-9]\d*\s+)/iu.test(text);
  const hasAnd = /\s+and\s+(?=up to [1-9]\d*\s+)/iu.test(text);
  if (hasOr && hasAnd) {
    return undefined;
  }
  const connector = hasOr ? "or" : hasAnd ? "and" : "single";
  const pieces =
    connector === "single"
      ? [text]
      : text.split(
          connector === "or"
            ? /\s+or\s+(?=up to [1-9]\d*\s+)/iu
            : /\s+and\s+(?=up to [1-9]\d*\s+)/iu,
        );
  const parts = pieces.map((piece) => parseQuantifiedPlayFilter(piece.trim()));
  if (parts.some((part) => part === undefined)) {
    return undefined;
  }
  return {
    connector,
    parts: parts.filter(
      (part): part is QuantifiedPlayFilter => part !== undefined,
    ),
  };
}

function parseQuantifiedPlayFilter(
  text: string,
): QuantifiedPlayFilter | undefined {
  const cardinality = parseUpToCardinality({ text });
  if (cardinality === undefined) {
    return undefined;
  }
  const predicates = parseCardFilterPredicates({ text: cardinality.rest });
  if (predicates === undefined || predicates.rest.length > 0) {
    return undefined;
  }
  return {
    cardinality: cardinality.cardinality,
    filter: predicates.filter,
    evidence: [...cardinality.evidence, ...predicates.evidence],
  };
}

function buildHandOrTrashChoice({
  cardinality,
  filter,
  enterRested,
  selectionSuffix,
}: {
  readonly cardinality: { readonly min: number; readonly max: number };
  readonly filter: CardFilter;
  readonly enterRested: boolean;
  readonly selectionSuffix?: string;
}) {
  const handSelection =
    selectionSuffix === undefined
      ? handOrTrashHandSelection
      : (`${handOrTrashHandSelection}:${selectionSuffix}` as HandSelectionId);
  const trashSelection =
    selectionSuffix === undefined
      ? handOrTrashTrashSelection
      : (`${handOrTrashTrashSelection}:${selectionSuffix}` as SelectionId);
  return {
    effect: {
      type: "choice" as const,
      chooser: "self" as const,
      min: 0,
      max: 1,
      options: [
        {
          id: `choice:play-from-hand${selectionSuffix === undefined ? "" : `:${selectionSuffix}`}`,
          label: "Play from hand.",
          effect: playSelectedFromZone({
            selection: handSelection,
            zone: "hand",
            player: "self",
            visibility: "chooserOnly",
            filter,
            min: cardinality.min,
            max: cardinality.max,
            enterRested,
          }),
        },
        {
          id: `choice:play-from-trash${selectionSuffix === undefined ? "" : `:${selectionSuffix}`}`,
          label: "Play from trash.",
          effect: playSelectedFromZone({
            selection: trashSelection,
            zone: "trash",
            player: "self",
            visibility: "bothPlayers",
            filter,
            min: cardinality.min,
            max: cardinality.max,
            enterRested,
          }),
        },
      ],
    },
  };
}

function playSelectedFromZone({
  selection,
  zone,
  player,
  visibility,
  filter,
  min,
  max,
  enterRested,
}: {
  readonly selection: SelectionId;
  readonly zone: "hand" | "trash";
  readonly player: "self" | "opponent";
  readonly visibility: "chooserOnly" | "bothPlayers";
  readonly filter: NonNullable<
    ReturnType<typeof parseCardFilterPredicates>
  >["filter"];
  readonly min: number;
  readonly max: number;
  readonly enterRested: boolean;
}) {
  return {
    type: "sequence" as const,
    effects: [
      {
        connector: "always" as const,
        saveResultAs: selection,
        effect: {
          type: "selectCards" as const,
          zone,
          player,
          chooser: player,
          min,
          max,
          filter,
          saveAs: selection,
          visibility,
        },
      },
      {
        connector: "ifPossible" as const,
        effect: {
          type: "playSelected" as const,
          selection,
          ignoreCost: true,
          ...(player === "self" ? {} : { player }),
          ...(enterRested ? { enterRested: true } : {}),
        },
      },
    ],
  };
}

function parsePlayFromHandSource(
  text: string,
  player: "self" | "opponent" = "self",
):
  | {
      readonly filter: NonNullable<
        ReturnType<typeof parseCardFilterPredicates>
      >["filter"];
      readonly evidence: NonNullable<
        ReturnType<typeof parseCardFilterPredicates>
      >["evidence"];
      readonly enterRested: boolean;
    }
  | undefined {
  const sourceText = player === "self" ? "your hand" : "their hand";
  const sourceMatch = new RegExp(
    `^(?<predicates>.+?) from ${sourceText}(?<postPredicates>\\s+with .+?)?(?<colorRelation>\\s+that is a different color than the returned Character)?(?<rested>\\s+rested)?\\.?$`,
    "iu",
  ).exec(text);
  if (sourceMatch === null) {
    return undefined;
  }
  const predicateText = sourceMatch.groups?.["predicates"];
  if (predicateText === undefined) {
    return undefined;
  }

  const predicates = parseCardFilterPredicates({
    text: normalizePlayFromHandPredicateText(
      `${predicateText}${sourceMatch.groups?.["postPredicates"] ?? ""}`,
      player,
    ),
  });
  const hasReturnedColorRelation =
    sourceMatch.groups?.["colorRelation"] !== undefined;
  return predicates === undefined || predicates.rest.length > 0
    ? undefined
    : {
        filter: {
          ...predicates.filter,
          ...(hasReturnedColorRelation
            ? {
                colorRelation: {
                  type: "differentFromSavedFieldObject" as const,
                  binding: {
                    family: "selectedTargets" as const,
                    saveResultAs: returnToOwnerHandSelectionId,
                  },
                },
              }
            : {}),
        },
        evidence: [
          ...predicates.evidence,
          ...(hasReturnedColorRelation
            ? (["filter:colorRelation"] as const)
            : []),
        ],
        enterRested: sourceMatch.groups?.["rested"] !== undefined,
      };
}

function normalizePlayFromHandPredicateText(
  text: string,
  player: "self" | "opponent",
): string {
  return player === "self"
    ? text.replace(/^of your\s+/iu, "").trim()
    : text.replace(/^of their\s+/iu, "").trim();
}
