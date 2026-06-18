import type { Effect, SelectionId } from "@optcg/types";

import { parseUpToCardinality } from "../cardinality/index.js";
import { parseCardFilterPredicates } from "../filters/index.js";
import type { InstructionParser, PrimitiveEvidence } from "../types.js";

const trashPlaySelection = "trashSelection:play" as SelectionId;
type SequenceEffect = Extract<Effect, { type: "sequence" }>;

export const parsePlayFromTrashInstruction: InstructionParser = (input) => {
  const multiNamed = parseMultiNamedPlayFromTrashInstruction(input);
  if (multiNamed !== undefined) {
    return multiNamed;
  }

  const repeated = parseRepeatedFilteredPlayFromTrashInstruction(input);
  if (repeated !== undefined) {
    return repeated;
  }

  const playMatch = /^play\s+(?<rest>.+)$/i.exec(input.text);
  const afterPlay = playMatch?.groups?.["rest"];
  if (afterPlay === undefined) {
    return undefined;
  }

  const cardinality = parseUpToCardinality({ text: afterPlay });
  if (cardinality === undefined) {
    return undefined;
  }

  const source = parsePlaySource(cardinality.rest);
  if (source === undefined) {
    return undefined;
  }

  return {
    effect: {
      type: "sequence",
      effects: [
        {
          id: "select:trash-play",
          connector: "always",
          saveResultAs: trashPlaySelection,
          effect: {
            type: "selectCards",
            zone: "trash",
            player: "self",
            chooser: "self",
            min: cardinality.cardinality.min,
            max: cardinality.cardinality.max,
            filter: source.filter,
            saveAs: trashPlaySelection,
            visibility: "bothPlayers",
          },
        },
        {
          id: "play:selected-from-trash",
          connector: "ifPossible",
          effect: {
            type: "playSelected",
            selection: trashPlaySelection,
            ignoreCost: true,
            ...(source.enterRested ? { enterRested: true } : {}),
          },
        },
      ],
    },
    evidence: [
      "instruction:playSelected",
      ...cardinality.evidence,
      "zone:trash",
      "player:self",
      "chooser:self:upTo",
      ...source.evidence,
      ...(source.enterRested ? ["state:rested" as const] : []),
      "composition:selectThenPlay",
    ],
    rest: "",
  };
};

const parseRepeatedFilteredPlayFromTrashInstruction: InstructionParser = (
  input,
) => {
  const match =
    /^play\s+(?<plays>.+) from your trash(?<rested>\s+rested)?\.?$/iu.exec(
      input.text,
    );
  const playsText = match?.groups?.["plays"];
  if (playsText === undefined) {
    return undefined;
  }
  const parts = playsText
    .split(/\s+and\s+(?=up to [1-9]\d*\s+)/iu)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length < 2) {
    return undefined;
  }

  const enterRested = match?.groups?.["rested"] !== undefined;
  const effects: SequenceEffect["effects"] = [];
  const evidence: PrimitiveEvidence[] = [
    "instruction:playSelected",
    "zone:trash",
    "player:self",
    "chooser:self:upTo",
  ];

  for (const [index, part] of parts.entries()) {
    const cardinality = parseUpToCardinality({ text: part });
    if (cardinality === undefined) {
      return undefined;
    }
    const predicates = parseCardFilterPredicates({
      text: normalizeOwnedSourcePredicate(cardinality.rest),
    });
    if (predicates === undefined || predicates.rest.length > 0) {
      return undefined;
    }
    const selection =
      `trashSelection:play:repeated:${String(index)}` as SelectionId;
    effects.push(
      {
        id: `select:trash-play:${String(index)}`,
        connector: index === 0 ? "always" : "then",
        saveResultAs: selection,
        effect: {
          type: "selectCards",
          zone: "trash",
          player: "self",
          chooser: "self",
          min: cardinality.cardinality.min,
          max: cardinality.cardinality.max,
          filter: predicates.filter,
          saveAs: selection,
          visibility: "bothPlayers",
        },
      },
      {
        id: `play:selected-from-trash:${String(index)}`,
        connector: "ifPossible",
        effect: {
          type: "playSelected",
          selection,
          ignoreCost: true,
          ...(enterRested ? { enterRested: true } : {}),
        },
      },
    );
    evidence.push(...cardinality.evidence, ...predicates.evidence);
  }

  return {
    effect: { type: "sequence", effects },
    evidence: [
      ...evidence,
      ...(enterRested ? ["state:rested" as const] : []),
      "composition:selectThenPlay",
      "expression:sequence",
    ],
    rest: "",
  };
};

const parseMultiNamedPlayFromTrashInstruction: InstructionParser = (input) => {
  const match =
    /^play\s+(?<names>up to [1-9]\d* \[[^\]]+\](?:,\s*up to [1-9]\d* \[[^\]]+\])*(?:,\s*and\s+up to [1-9]\d* \[[^\]]+\])?),\s*(?<shared>with .+?) from your trash(?<rested>\s+rested)?\.?$/iu.exec(
      input.text,
    );
  const namesText = match?.groups?.["names"];
  const sharedPredicateText = match?.groups?.["shared"];
  if (namesText === undefined || sharedPredicateText === undefined) {
    return undefined;
  }

  const nameParts = [
    ...namesText.matchAll(/(?<quantity>up to [1-9]\d*) \[(?<name>[^\]]+)\]/giu),
  ];
  if (nameParts.length < 2) {
    return undefined;
  }

  const normalizedSharedPredicateText = sharedPredicateText.replace(
    /^with\s+/iu,
    "",
  );
  const sharedPredicates = parseCardFilterPredicates({
    text: normalizedSharedPredicateText,
  });
  if (
    sharedPredicates === undefined ||
    sharedPredicates.rest.trim().length > 0
  ) {
    return undefined;
  }
  if (match === null) {
    return undefined;
  }
  const enterRested = match.groups?.["rested"] !== undefined;

  const effects: SequenceEffect["effects"] = [];
  const evidence: PrimitiveEvidence[] = [
    "instruction:playSelected" as const,
    "zone:trash" as const,
    "player:self" as const,
    "chooser:self:upTo" as const,
  ];

  for (const [index, part] of nameParts.entries()) {
    const quantityText = part.groups?.["quantity"];
    const name = part.groups?.["name"]?.trim();
    if (quantityText === undefined || name === undefined || name.length === 0) {
      return undefined;
    }
    const cardinality = parseUpToCardinality({ text: quantityText });
    if (cardinality === undefined || cardinality.rest.length > 0) {
      return undefined;
    }
    const selection =
      `trashSelection:play:named:${String(index)}` as SelectionId;
    const filter = {
      ...sharedPredicates.filter,
      names: [name],
    };
    effects.push(
      {
        id: `select:trash-play:${String(index)}`,
        connector: index === 0 ? ("always" as const) : ("then" as const),
        saveResultAs: selection,
        effect: {
          type: "selectCards" as const,
          zone: "trash" as const,
          player: "self" as const,
          chooser: "self" as const,
          min: cardinality.cardinality.min,
          max: cardinality.cardinality.max,
          filter,
          saveAs: selection,
          visibility: "bothPlayers" as const,
        },
      },
      {
        id: `play:selected-from-trash:${String(index)}`,
        connector: "ifPossible" as const,
        effect: {
          type: "playSelected" as const,
          selection,
          ignoreCost: true,
          ...(enterRested ? { enterRested: true } : {}),
        },
      },
    );
    evidence.push(...cardinality.evidence, "filter:name");
  }

  return {
    effect: {
      type: "sequence",
      effects,
    },
    evidence: [
      ...evidence,
      ...sharedPredicates.evidence,
      ...(enterRested ? ["state:rested" as const] : []),
      "composition:selectThenPlay",
      "expression:sequence",
    ],
    rest: "",
  };
};

function parsePlaySource(text: string):
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
  const sourceMatch =
    /^(?<predicates>.+) from your trash(?<rested>\s+rested)?\.?$/i.exec(text);
  const predicateText = sourceMatch?.groups?.["predicates"];
  if (predicateText === undefined) {
    return undefined;
  }

  const predicates = parseCardFilterPredicates({
    text: normalizeOwnedSourcePredicate(predicateText),
  });
  return predicates === undefined || predicates.rest.length > 0
    ? undefined
    : {
        filter: predicates.filter,
        evidence: predicates.evidence,
        enterRested: sourceMatch?.groups?.["rested"] !== undefined,
      };
}

const normalizeOwnedSourcePredicate = (text: string): string =>
  text.replace(/^of your\s+/iu, "").trim();
