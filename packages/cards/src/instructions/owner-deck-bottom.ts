import type { Effect, SelectCardMax, SelectionId, Target } from "@optcg/types";

import {
  parseAnyNumberCardinality,
  parseUpToCardinality,
} from "../cardinality/index.js";
import { parseCardFilterPredicates } from "../filters/index.js";
import {
  parseAllFieldTarget,
  parseOpponentCharactersTarget,
} from "../targets/index.js";
import type { InstructionParser, PrimitiveEvidence } from "../types.js";
import { selectThenApplyFieldTarget } from "./effect-builders.js";

const ownerDeckBottomSelectionId = "selected:owner-deck-bottom";
const ownerDeckBottomTrashSelectionId =
  "trashSelection:owner-deck-bottom" as SelectionId;

type CharacterFilter = NonNullable<
  Extract<Target, { type: "choose" }>["request"]["filter"]
>;
type CardFilter = NonNullable<
  ReturnType<typeof parseCardFilterPredicates>
>["filter"];
type SequenceEffect = Extract<Effect, { type: "sequence" }>;

const selectThenPlaceAtOwnerDeckBottom = (
  player: "opponent" | "anyPlayer",
  min: number,
  max: number,
  filter: CharacterFilter,
  selectionId: string = ownerDeckBottomSelectionId,
): Effect =>
  selectThenApplyFieldTarget({
    selectionId,
    selectId: `select:owner-deck-bottom:${selectionId}`,
    player,
    zone: "characterArea",
    filter,
    min,
    max,
    apply: (target) => ({
      type: "bounce",
      destination: "deckBottom",
      target,
    }),
  });

const selectTrashThenPlaceAtOwnerDeckBottom = (
  player: "self" | "opponent",
  min: number,
  max: SelectCardMax,
  filter?: CardFilter,
): Effect => ({
  type: "sequence",
  effects: [
    {
      id: "select:trash-to-owner-deck-bottom",
      connector: "always",
      saveResultAs: ownerDeckBottomTrashSelectionId,
      effect: {
        type: "selectCards",
        zone: "trash",
        player,
        chooser: "self",
        min,
        max,
        ...(filter === undefined ? {} : { filter }),
        saveAs: ownerDeckBottomTrashSelectionId,
        visibility: "bothPlayers",
      },
    },
    {
      id: "move:selected-trash-to-owner-deck-bottom",
      connector: "then",
      effect: {
        type: "moveSelected",
        selection: ownerDeckBottomTrashSelectionId,
        from: "trash",
        to: "deck",
        position: "bottom",
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

const normalizeTrashPredicateText = (text: string): string =>
  text
    .replace(/^of your opponent's\s+/iu, "")
    .replace(/^your opponent's\s+/iu, "")
    .replace(/^of your\s+/iu, "")
    .replace(/^your\s+/iu, "");

const parseTrashSource = (
  text: string,
):
  | {
      readonly evidence: readonly PrimitiveEvidence[];
      readonly filter?: CardFilter;
      readonly player: "self" | "opponent";
    }
  | undefined => {
  const sourceMatch =
    /^(?<predicates>.+?) from (?<owner>your opponent's|your) trash$/iu.exec(
      text.trim(),
    );
  const predicateText = sourceMatch?.groups?.["predicates"];
  const owner = sourceMatch?.groups?.["owner"];
  if (predicateText === undefined || owner === undefined) {
    return undefined;
  }

  const player = owner === "your" ? "self" : "opponent";
  const normalizedPredicateText = normalizeTrashPredicateText(predicateText);
  if (/^cards?$/iu.test(normalizedPredicateText)) {
    return {
      evidence: ["filter:any"],
      player,
    };
  }

  const predicates = parseCardFilterPredicates({
    text: normalizedPredicateText,
  });
  return predicates === undefined || predicates.rest.length > 0
    ? undefined
    : {
        evidence: predicates.evidence,
        filter: predicates.filter,
        player,
      };
};

const parseTrashDeckBottomCardinality = (text: string) =>
  parseUpToCardinality({ text }) ?? parseAnyNumberCardinality({ text });

export const parsePlaceAtOwnerDeckBottomInstruction: InstructionParser = (
  input,
) => {
  const match =
    /^(?:place|return)\s+(?<selection>.+?)\s+(?:at|to) the bottom of the owner's deck(?<order>\s+in any order)?\.?$/iu.exec(
      input.text,
    );
  const selectionText = match?.groups?.["selection"];
  if (selectionText === undefined) {
    return undefined;
  }

  if (/^this Character$/iu.test(selectionText)) {
    return {
      effect: {
        type: "bounce",
        destination: "deckBottom",
        target: { type: "self" },
      },
      evidence: [
        "instruction:bounce",
        "target:thisCharacter",
        "destination:deck",
        "position:bottom",
      ],
      rest: "",
    };
  }

  const allTarget = parseAllFieldTarget({ text: selectionText });
  if (allTarget !== undefined && allTarget.rest.length === 0) {
    return {
      effect: {
        type: "bounce",
        destination: "deckBottom",
        target: allTarget.target,
      },
      evidence: [
        "instruction:bounce",
        ...allTarget.evidence,
        "destination:deck",
        "position:bottom",
      ],
      rest: "",
    };
  }

  const cardinality = parseTrashDeckBottomCardinality(selectionText);
  if (cardinality === undefined) {
    return undefined;
  }
  const orderEvidence: readonly PrimitiveEvidence[] =
    match?.groups?.["order"] === undefined ? [] : ["order:anyOrder"];

  const trashSource = parseTrashSource(cardinality.rest);
  if (trashSource !== undefined) {
    return {
      effect: selectTrashThenPlaceAtOwnerDeckBottom(
        trashSource.player,
        cardinality.cardinality.min,
        cardinality.cardinality.max,
        trashSource.filter,
      ),
      evidence: [
        "instruction:moveSelected",
        ...cardinality.evidence,
        "chooser:self:upTo",
        "zone:trash",
        trashSource.player === "self" ? "player:self" : "player:opponent",
        ...trashSource.evidence,
        "destination:deck",
        "position:bottom",
        ...orderEvidence,
        "composition:selectThenMove",
      ],
      rest: "",
    };
  }

  const repeatedTargets = parseRepeatedOwnerDeckBottomTargets(selectionText);
  if (repeatedTargets !== undefined) {
    return repeatedTargets;
  }

  if (cardinality.cardinality.mode !== "upTo") {
    return undefined;
  }

  const target = parseOwnerDeckBottomTarget(cardinality.rest);
  if (target === undefined || target.rest.length > 0) {
    return undefined;
  }

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

const parseRepeatedOwnerDeckBottomTargets = (
  selectionText: string,
): ReturnType<InstructionParser> => {
  const parts = selectionText
    .split(/\s+and\s+(?=up to [1-9]\d*\s+)/iu)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length < 2) {
    return undefined;
  }

  const effects: SequenceEffect["effects"] = [];
  const evidence: PrimitiveEvidence[] = [
    "instruction:moveSelected",
    "chooser:self:upTo",
  ];

  for (const [index, part] of parts.entries()) {
    const cardinality = parseUpToCardinality({ text: part });
    if (cardinality === undefined) {
      return undefined;
    }
    const target = parseOwnerDeckBottomTarget(cardinality.rest);
    if (target === undefined || target.rest.length > 0) {
      return undefined;
    }
    const selectionId = `selected:owner-deck-bottom:${String(index)}`;
    effects.push({
      id: `owner-deck-bottom:${String(index)}`,
      connector: index === 0 ? "always" : "then",
      effect: selectThenPlaceAtOwnerDeckBottom(
        target.player,
        cardinality.cardinality.min,
        cardinality.cardinality.max,
        target.filter,
        selectionId,
      ),
    });
    evidence.push(...cardinality.evidence, ...target.evidence);
  }

  return {
    effect: { type: "sequence", effects },
    evidence: [
      ...evidence,
      "destination:deck",
      "position:bottom",
      "composition:selectThenApply",
      "composition:sequence",
    ],
    rest: "",
  };
};
