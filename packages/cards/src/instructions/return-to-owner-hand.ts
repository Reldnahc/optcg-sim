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
import {
  fieldZoneForCategory,
  selectThenApplyFieldTarget,
  type PublicFieldSelectionZone,
} from "./effect-builders.js";

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
  if (/^this Character$/iu.test(rest.trim())) {
    return {
      effect: {
        type: "bounce",
        target: { type: "self" },
        destination: "hand",
      },
      evidence: [
        "instruction:returnToOwnerHand",
        "target:thisCharacter",
        "destination:ownerHand",
      ],
      rest: "",
    };
  }

  const sharedSelections = parseSharedDestinationReturnSelections(rest);
  if (sharedSelections !== undefined) {
    return sharedSelections;
  }

  const selection = parseReturnSelectionToOwnerHand(rest);
  if (selection === undefined) {
    return undefined;
  }
  return { ...selection, rest: "" };
};

function parseReturnSelectionToOwnerHand(text: string):
  | {
      readonly effect: Effect;
      readonly evidence: readonly PrimitiveEvidence[];
    }
  | undefined {
  const allNamedSelfCharacters = parseAllNamedSelfCharacters(text);
  if (allNamedSelfCharacters !== undefined) {
    return allNamedSelfCharacters;
  }

  const cardinality = parseReturnCardinality(text);
  if (cardinality === undefined) {
    return undefined;
  }
  const opponentTarget = parseOpponentFieldTarget({ text: cardinality.rest });
  if (
    opponentTarget !== undefined &&
    (opponentTarget.rest.length === 0 || opponentTarget.rest === ".")
  ) {
    const category = opponentTarget.filter?.categories?.[0];
    const zone = fieldZoneForCategory(category) ?? "characterArea";
    return {
      effect: selectThenReturnToOwnerHand(
        "opponent",
        cardinality.min,
        cardinality.max,
        opponentTarget.filter ?? { categories: ["character"] },
        zone,
      ),
      evidence: [
        "instruction:returnToOwnerHand",
        ...cardinality.evidence,
        ...opponentTarget.evidence,
        "destination:ownerHand",
        "composition:selectThenApply",
      ],
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
      fieldZoneForCategory(predicates.filter.categories?.[0]) ??
        "characterArea",
    ),
    evidence: [
      "instruction:returnToOwnerHand",
      ...cardinality.evidence,
      "player:any",
      ...predicates.evidence,
      "destination:ownerHand",
      "composition:selectThenApply",
    ],
  };
}

function parseAllNamedSelfCharacters(text: string):
  | {
      readonly effect: Effect;
      readonly evidence: readonly PrimitiveEvidence[];
    }
  | undefined {
  const match =
    /^all of your (?<names>(?:\[[^\]]+\](?:\s+and\s+)?)+) Characters$/iu.exec(
      text.trim(),
    );
  const namesText = match?.groups?.["names"];
  if (namesText === undefined) {
    return undefined;
  }
  const names = [...namesText.matchAll(/\[([^\]]+)\]/gu)]
    .map((nameMatch) => nameMatch[1]?.trim())
    .filter((name): name is string => name !== undefined && name.length > 0);
  if (names.length === 0) {
    return undefined;
  }

  return {
    effect: {
      type: "bounce",
      destination: "hand",
      target: {
        type: "all",
        player: "self",
        zone: "characterArea",
        filter: {
          categories: ["character"],
          names,
        },
      },
    },
    evidence: [
      "instruction:returnToOwnerHand",
      "cardinality:all",
      "player:self",
      "zone:characterArea",
      "filter:name",
      "filter:category:character",
      "destination:ownerHand",
    ],
  };
}

function parseSharedDestinationReturnSelections(
  text: string,
): ReturnType<InstructionParser> {
  const selections = text
    .split(/\s+and\s+(?=(?:up to|[1-9]\d*\s))/iu)
    .map((selection) => selection.trim())
    .filter((selection) => selection.length > 0);
  if (selections.length < 2) {
    return undefined;
  }

  const parsed = selections.map(parseReturnSelectionToOwnerHand);
  if (parsed.some((selection) => selection === undefined)) {
    return undefined;
  }
  const effects = parsed.filter(
    (selection): selection is NonNullable<typeof selection> =>
      selection !== undefined,
  );

  return {
    effect: {
      type: "sequence",
      effects: effects.map((selection, index) => ({
        connector: index === 0 ? "always" : "then",
        effect: selection.effect,
      })),
    },
    evidence: [
      "expression:sequence",
      ...effects.flatMap((selection) => selection.evidence),
    ],
    rest: "",
  };
}

export function selectThenReturnToOwnerHand(
  player: "self" | "opponent" | "anyPlayer",
  min: number,
  max: number,
  filter: NonNullable<Extract<Target, { type: "choose" }>["request"]["filter"]>,
  zone: PublicFieldSelectionZone = "characterArea",
  chooser: "self" | "opponent" = "self",
): Effect {
  return selectThenApplyFieldTarget({
    selectionId: returnToOwnerHandSelectionId,
    selectId: "select:return-to-owner-hand",
    player,
    chooser,
    zone,
    min,
    max,
    filter,
    apply: (target) => ({
      type: "bounce",
      destination: "hand",
      target,
    }),
  });
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
