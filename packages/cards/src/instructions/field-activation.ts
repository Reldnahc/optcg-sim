import type { CardFilter, SelectionId } from "@optcg/types";

import { parseUpToCardinality } from "../cardinality/index.js";
import { parseCardFilterPredicates } from "../filters/index.js";
import type { InstructionParser } from "../types.js";

const fieldActivationTarget = "targetSelection:set-field-active" as SelectionId;

export const parseSetFieldActiveInstruction: InstructionParser = (input) => {
  const massFieldActivation = parseSetLeaderAndCharactersActive(input.text);
  if (massFieldActivation !== undefined) {
    return massFieldActivation;
  }

  const match = /^set (?<quantity>up to [1-9]\d* .+) as active\.?$/i.exec(
    input.text,
  );
  const quantityText = match?.groups?.["quantity"];
  if (quantityText === undefined) {
    return undefined;
  }

  const quantity = parseUpToCardinality({ text: quantityText });
  if (quantity === undefined) {
    return undefined;
  }
  const targetText = parseSelfCharacterTargetText(quantity.rest);
  if (targetText === undefined) {
    return undefined;
  }

  const parsedTarget = parseCardFilterPredicates(
    { text: targetText },
    { powerSemantics: "current" },
  );
  if (
    parsedTarget === undefined ||
    parsedTarget.rest.trim().length > 0 ||
    !isCharacterFilter(parsedTarget.filter)
  ) {
    return undefined;
  }

  return {
    effect: {
      type: "sequence",
      effects: [
        {
          id: "select:field-to-activate",
          connector: "always",
          saveResultAs: fieldActivationTarget,
          effect: {
            type: "selectTargets",
            request: {
              timing: "onResolution",
              chooser: "self",
              zone: "characterArea",
              player: "self",
              filter: parsedTarget.filter,
              min: quantity.cardinality.min,
              max: quantity.cardinality.max,
              allowFewerIfUnavailable: true,
              visibility: "public",
            },
          },
        },
        {
          id: "activate:selected-field",
          connector: "then",
          effect: {
            type: "activate",
            target: {
              type: "savedFieldObject",
              binding: {
                family: "selectedTargets",
                saveResultAs: fieldActivationTarget,
              },
              zone: "characterArea",
              player: "self",
              visibility: "publicOnly",
              onFailure: "failClosed",
            },
          },
        },
      ],
    },
    evidence: [
      "instruction:activate",
      ...quantity.evidence,
      "player:self",
      "chooser:self:upTo",
      "zone:characterArea",
      ...parsedTarget.evidence,
      "state:active",
      "composition:selectThenApply",
    ],
    rest: "",
  };
};

function parseSetLeaderAndCharactersActive(
  text: string,
): ReturnType<InstructionParser> {
  if (
    !/^set your Leader and all of your Characters as active\.?$/i.test(text)
  ) {
    return undefined;
  }

  return {
    effect: {
      type: "sequence",
      effects: [
        {
          connector: "always",
          effect: { type: "activate", target: { type: "myLeader" } },
        },
        {
          connector: "always",
          effect: {
            type: "activate",
            target: {
              type: "all",
              player: "self",
              zone: "characterArea",
              filter: { categories: ["character"] },
            },
          },
        },
      ],
    },
    evidence: [
      "instruction:activate",
      "target:yourLeader",
      "cardinality:all",
      "player:self",
      "zone:characterArea",
      "filter:category:character",
      "state:active",
      "composition:sequence",
    ],
    rest: "",
  };
}

function parseSelfCharacterTargetText(text: string): string | undefined {
  const match = /^of your (?<target>.+)$/i.exec(text.trim());
  const targetText = match?.groups?.["target"]?.trim();
  return targetText === undefined || targetText.length === 0
    ? undefined
    : targetText;
}

function isCharacterFilter(
  filter: CardFilter,
): filter is CardFilter & { readonly categories: readonly ["character"] } {
  return filter.categories?.includes("character") === true;
}
