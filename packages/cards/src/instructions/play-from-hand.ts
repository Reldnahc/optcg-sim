import type { CardFilter, HandSelectionId, SelectionId } from "@optcg/types";

import { parseUpToCardinality } from "../cardinality/index.js";
import { parseCardFilterPredicates } from "../filters/index.js";
import type { InstructionParser } from "../types.js";

const handPlaySelection = "handSelection:play-from-hand" as HandSelectionId;
const handOrTrashHandSelection =
  "handSelection:play-from-hand-or-trash:hand" as HandSelectionId;
const handOrTrashTrashSelection =
  "trashSelection:play-from-hand-or-trash:trash" as SelectionId;

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

  const cardinality = parseUpToCardinality({ text: afterPlay });
  if (cardinality === undefined) {
    return undefined;
  }

  const sourceMatch =
    /^(?<predicates>.+) from your hand or trash(?<rested>\s+rested)?\.?$/i.exec(
      cardinality.rest,
    );
  if (sourceMatch === null) {
    return undefined;
  }
  const groups = sourceMatch.groups;
  if (groups === undefined) {
    return undefined;
  }
  const predicateText = groups["predicates"];
  if (predicateText === undefined) {
    return undefined;
  }

  const predicates = parseCardFilterPredicates({ text: predicateText });
  if (predicates === undefined || predicates.rest.length > 0) {
    return undefined;
  }
  const enterRested = groups["rested"] !== undefined;

  return {
    effect: {
      type: "choice",
      chooser: "self",
      min: 0,
      max: 1,
      options: [
        {
          id: "choice:play-from-hand",
          label: "Play from hand.",
          effect: playSelectedFromZone({
            selection: handOrTrashHandSelection,
            zone: "hand",
            visibility: "chooserOnly",
            filter: predicates.filter,
            min: cardinality.cardinality.min,
            max: cardinality.cardinality.max,
            enterRested,
          }),
        },
        {
          id: "choice:play-from-trash",
          label: "Play from trash.",
          effect: playSelectedFromZone({
            selection: handOrTrashTrashSelection,
            zone: "trash",
            visibility: "bothPlayers",
            filter: predicates.filter,
            min: cardinality.cardinality.min,
            max: cardinality.cardinality.max,
            enterRested,
          }),
        },
      ],
    },
    evidence: [
      "instruction:playSelected",
      ...cardinality.evidence,
      "zone:hand",
      "zone:trash",
      "player:self",
      "chooser:self:upTo",
      ...predicates.evidence,
      ...(enterRested ? ["state:rested" as const] : []),
      "composition:selectThenPlay",
      "composition:chooseOne",
    ],
    rest: "",
  };
};

function playSelectedFromZone({
  selection,
  zone,
  visibility,
  filter,
  min,
  max,
  enterRested,
}: {
  readonly selection: SelectionId;
  readonly zone: "hand" | "trash";
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
          player: "self" as const,
          chooser: "self" as const,
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
    `^(?<predicates>.+) from ${sourceText}(?<rested>\\s+rested)?\\.?$`,
    "iu",
  ).exec(text);
  if (sourceMatch === null) {
    return undefined;
  }
  const predicateText = sourceMatch.groups?.["predicates"];
  if (predicateText === undefined) {
    return undefined;
  }

  const predicates = parseCardFilterPredicates({ text: predicateText });
  return predicates === undefined || predicates.rest.length > 0
    ? undefined
    : {
        filter: predicates.filter,
        evidence: predicates.evidence,
        enterRested: sourceMatch.groups?.["rested"] !== undefined,
      };
}
