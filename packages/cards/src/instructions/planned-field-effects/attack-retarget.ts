import type { CardFilter, Target, Zone } from "@optcg/types";

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

const targetZones: Zone[] = ["leaderArea", "characterArea"];

const selectSegment = (typeName: string) => ({
  id: "select:change-attack-target",
  connector: "always" as const,
  saveResultAs: attackRetargetSelectionId,
  effect: {
    type: "selectTargets" as const,
    request: {
      timing: "onResolution" as const,
      chooser: "self" as const,
      player: "self" as const,
      zones: targetZones,
      min: 1,
      max: 1,
      allowFewerIfUnavailable: false,
      visibility: "public" as const,
      filter: leaderOrTypedCharacterFilter(typeName),
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
      effects: [selectSegment(typeName), changeAttackTargetSegment],
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

  const directMatch =
    /^Change the target of that attack to this Leader or to one of your \{(?<type>[^}]+)\} type Character cards\.?$/iu.exec(
      input.text,
    );
  const directType = directMatch?.groups?.["type"]?.trim();
  if (directType !== undefined && directType.length > 0) {
    return resultForType(input, directType);
  }

  return undefined;
};
