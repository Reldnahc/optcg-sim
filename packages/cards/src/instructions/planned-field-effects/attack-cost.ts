import type { EffectTextSpan } from "@optcg/types";

import {
  opponentNextEndOnlyDurationParsers,
  parseDurationFromSet,
} from "../../durations/index.js";
import { sourceSpan } from "../../source-slices.js";
import type {
  ExpressionParseResult,
  ParseInput,
  PrimitiveEvidence,
} from "../../types.js";

const attackCostTargetsSelectionId = "selected:attack-cost-targets";

const selectedAttackCostTarget = {
  type: "savedFieldObject",
  binding: {
    family: "selectedTargets",
    saveResultAs: attackCostTargetsSelectionId,
  },
  zone: "characterArea",
  player: "opponent",
  visibility: "publicOnly",
  onFailure: "failClosed",
} as const;

export const selectedOpponentCharactersAttackCostPrimitive = {
  primitiveId: "instruction:attackCost",
  childPrimitiveIds: [
    "target:opponentCharacters",
    "cost:trashFromHand",
    "duration:opponentNextEndPhase",
  ],
} as const;

export const selectedOpponentCharactersAttackCostExpressionParser = (
  input: ParseInput,
): ExpressionParseResult | undefined => {
  const match =
    /^select all of your opponent's Characters on their field\.\s+(?<duration>Until the end of your opponent's next turn),\s+none of the selected Characters can attack unless your opponent trashes (?<count>[1-9]\d*) cards? from their hand whenever they attack\.?$/iu.exec(
      input.text,
    );
  const durationText = match?.groups?.["duration"];
  const countText = match?.groups?.["count"];
  if (durationText === undefined || countText === undefined) {
    return undefined;
  }

  const duration = parseDurationFromSet(
    { text: durationText },
    opponentNextEndOnlyDurationParsers,
  );
  const count = Number.parseInt(countText, 10);
  if (
    duration?.duration === undefined ||
    duration.rest.length > 0 ||
    !Number.isSafeInteger(count) ||
    count <= 0
  ) {
    return undefined;
  }

  const evidence: readonly PrimitiveEvidence[] = [
    "instruction:selectAllTargets",
    "target:opponentCharacters",
    "filter:category:character",
    "instruction:attackCost",
    "cost:trashFromHand",
    ...duration.evidence,
    "composition:selectThenApply",
  ];

  return {
    effect: {
      type: "sequence",
      effects: [
        {
          connector: "always",
          saveResultAs: attackCostTargetsSelectionId,
          effect: {
            type: "selectAllTargets",
            request: {
              timing: "onResolution",
              chooser: "self",
              player: "opponent",
              zone: "characterArea",
              filter: { categories: ["character"] },
              visibility: "public",
            },
          },
        },
        {
          connector: "then",
          effect: {
            type: "attackCost",
            target: selectedAttackCostTarget,
            cost: { type: "trashFromHand", count },
            duration: duration.duration,
          },
        },
      ],
    },
    evidence,
    ...bodyPresentation(input, evidence),
    rest: "",
  };
};

function bodyPresentation(
  input: ParseInput,
  evidence: readonly PrimitiveEvidence[],
): { readonly presentationSpans?: readonly EffectTextSpan[] } {
  return input.source === undefined
    ? {}
    : {
        presentationSpans: [
          sourceSpan("span:body", "body", input.source, evidence),
        ],
      };
}
