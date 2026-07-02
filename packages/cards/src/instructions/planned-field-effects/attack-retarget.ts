import type { CardFilter, Target, Zone } from "@optcg/types";

import { parseCardFilterPredicates } from "../../filters/index.js";
import { sourceSpan } from "../../source-slices.js";
import type {
  ExpressionParseResult,
  ParseInput,
  PrimitiveEvidence,
} from "../../types.js";

const attackRetargetSelectionId = "targetSelection:change-attack-target";

const selectedAttackRetargetTarget: Extract<
  Target,
  { type: "savedFieldObject" }
> = {
  type: "savedFieldObject",
  binding: {
    family: "selectedTargets",
    saveResultAs: attackRetargetSelectionId,
  },
  zones: ["leaderArea", "characterArea"],
  player: "self",
  visibility: "publicOnly",
  onFailure: "failClosed",
};

const leaderOrTypedCharacterFilter = (typeName: string): CardFilter => ({
  anyOf: [
    { categories: ["leader"] },
    { categories: ["character"], typesAny: [typeName] },
  ],
});

const characterFilter: CardFilter = { categories: ["character"] };

const targetZones: Zone[] = ["leaderArea", "characterArea"];
const characterTargetZones: Zone[] = ["characterArea"];

const selectSegment = (zones: Zone[], filter: CardFilter) => ({
  id: "select:change-attack-target",
  connector: "always" as const,
  saveResultAs: attackRetargetSelectionId,
  effect: {
    type: "selectTargets" as const,
    request: {
      timing: "onResolution" as const,
      chooser: "self" as const,
      player: "self" as const,
      zones,
      min: 1,
      max: 1,
      allowFewerIfUnavailable: false,
      visibility: "public" as const,
      filter,
    },
  },
});

const changeAttackTargetSegment = {
  id: "change-attack-target",
  connector: "then" as const,
  effect: {
    type: "changeAttackTarget" as const,
    target: selectedAttackRetargetTarget,
  },
};

const attackRetargetEvidence = (
  typeNameEvidence = true,
): PrimitiveEvidence[] => [
  "composition:selectThenApply",
  "instruction:changeAttackTarget",
  "target:yourLeaderOrCharacters",
  "player:self",
  "filter:anyOf",
  "filter:category:leader",
  "filter:category:character",
  ...(typeNameEvidence ? (["filter:type"] as const) : []),
];

const resultForType = (
  input: ParseInput,
  typeName: string,
): ExpressionParseResult => {
  const evidence = attackRetargetEvidence();
  return {
    effect: {
      type: "sequence",
      effects: [
        selectSegment(targetZones, leaderOrTypedCharacterFilter(typeName)),
        changeAttackTargetSegment,
      ],
    },
    evidence,
    rest: "",
    ...(input.source === undefined
      ? {}
      : {
          presentationSpans: [
            sourceSpan("span:body", "body", input.source, evidence),
          ],
        }),
  };
};

const resultForCharacters = (input: ParseInput): ExpressionParseResult => {
  const evidence: PrimitiveEvidence[] = [
    "composition:selectThenApply",
    "instruction:changeAttackTarget",
    "target:yourCharacters",
    "player:self",
    "filter:category:character",
  ];
  return {
    effect: {
      type: "sequence",
      effects: [
        selectSegment(characterTargetZones, characterFilter),
        changeAttackTargetSegment,
      ],
    },
    evidence,
    rest: "",
    ...(input.source === undefined
      ? {}
      : {
          presentationSpans: [
            sourceSpan("span:body", "body", input.source, evidence),
          ],
        }),
  };
};

const resultForFilteredSelfTarget = (
  input: ParseInput,
  filter: CardFilter,
  evidence: readonly PrimitiveEvidence[],
): ExpressionParseResult => {
  const categories = filter.categories ?? [];
  const targetFilter =
    categories.length === 0 && (filter.names?.length ?? 0) > 0
      ? ({ ...filter, categories: ["leader", "character"] } satisfies CardFilter)
      : filter;
  const targetCategories = targetFilter.categories ?? [];
  const zones =
    targetCategories.includes("leader") &&
    targetCategories.includes("character")
      ? targetZones
      : targetCategories.includes("leader")
        ? (["leaderArea"] as Zone[])
        : characterTargetZones;
  const resultEvidence: PrimitiveEvidence[] = [
    "composition:selectThenApply",
    "instruction:changeAttackTarget",
    ...(zones.includes("leaderArea")
      ? (["zone:leaderArea", "filter:category:leader"] as const)
      : []),
    ...(zones.includes("characterArea")
      ? (["zone:characterArea", "filter:category:character"] as const)
      : []),
    "player:self",
    ...evidence,
  ];
  return {
    effect: {
      type: "sequence",
      effects: [
        selectSegment(zones, targetFilter),
        changeAttackTargetSegment,
      ],
    },
    evidence: resultEvidence,
    rest: "",
    ...(input.source === undefined
      ? {}
      : {
          presentationSpans: [
            sourceSpan("span:body", "body", input.source, resultEvidence),
          ],
        }),
  };
};

export const selectedAttackRetargetExpressionParser = (
  input: ParseInput,
): ExpressionParseResult | undefined => {
  const selectedMatch =
    /^Select your Leader or 1 of your \{(?<type>[^}]+)\} type Characters?\. Change the attack target to the selected card\.?$/iu.exec(
      input.text,
    );
  const selectedType = selectedMatch?.groups?.["type"]?.trim();
  if (selectedType !== undefined && selectedType.length > 0) {
    return resultForType(input, selectedType);
  }

  if (
    /^Select 1 of your Characters?\. Change the attack target to the selected Character\.?$/iu.test(
      input.text,
    )
  ) {
    return resultForCharacters(input);
  }

  const directMatch =
    /^Change the target of that attack to this Leader or to one of your \{(?<type>[^}]+)\} type Character cards\.?$/iu.exec(
      input.text,
    );
  const directType = directMatch?.groups?.["type"]?.trim();
  if (directType !== undefined && directType.length > 0) {
    return resultForType(input, directType);
  }

  const filteredMatch =
    /^Change the target of that attack to one of your (?<target>.+?)\.?$/iu.exec(
      input.text,
    );
  const filteredText = filteredMatch?.groups?.["target"]?.trim();
  if (filteredText !== undefined && filteredText.length > 0) {
    const predicates = parseCardFilterPredicates(
      { text: filteredText },
      { powerSemantics: "printed" },
    );
    if (predicates !== undefined && predicates.rest.trim().length === 0) {
      return resultForFilteredSelfTarget(
        input,
        predicates.filter,
        predicates.evidence,
      );
    }
  }

  return undefined;
};
