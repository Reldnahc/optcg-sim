import type { CardFilter, SelectionId } from "@optcg/types";

import { parseUpToCardinality } from "../cardinality/index.js";
import { parseCardFilterPredicates } from "../filters/index.js";
import { parseYourLeaderOrCharacterCardsTarget } from "../targets/index.js";
import type { InstructionParser } from "../types.js";

const fieldActivationTarget = "targetSelection:set-field-active" as SelectionId;

export const parseSetFieldActiveInstruction: InstructionParser = (input) => {
  const selfActivation = parseSetThisCharacterActive(input.text);
  if (selfActivation !== undefined) {
    return selfActivation;
  }

  const leaderActivation = parseSetYourLeaderActive(input.text);
  if (leaderActivation !== undefined) {
    return leaderActivation;
  }

  const massFieldActivation = parseSetLeaderAndCharactersActive(input.text);
  if (massFieldActivation !== undefined) {
    return massFieldActivation;
  }

  const allFilteredActivation = parseSetAllFilteredCharactersActive(input.text);
  if (allFilteredActivation !== undefined) {
    return allFilteredActivation;
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
  const leaderOrCharacterTarget = parseYourLeaderOrCharacterCardsTarget({
    text: quantity.rest,
  });
  if (
    leaderOrCharacterTarget !== undefined &&
    leaderOrCharacterTarget.target?.type === "chooseFromZones" &&
    (leaderOrCharacterTarget.rest.length === 0 ||
      leaderOrCharacterTarget.rest === ".")
  ) {
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
                ...leaderOrCharacterTarget.target.request,
                min: quantity.cardinality.min,
                max: quantity.cardinality.max,
                allowFewerIfUnavailable: true,
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
                zones: ["leaderArea", "characterArea"],
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
        "chooser:self:upTo",
        ...leaderOrCharacterTarget.evidence,
        "state:active",
        "composition:selectThenApply",
      ],
      rest: "",
    };
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

function parseSetThisCharacterActive(
  text: string,
): ReturnType<InstructionParser> {
  if (!/^set this Character as active\.?$/i.test(text)) {
    return undefined;
  }

  return {
    effect: {
      type: "activate",
      target: { type: "self" },
    },
    evidence: ["instruction:activate", "target:thisCharacter", "state:active"],
    rest: "",
  };
}

function parseSetAllFilteredCharactersActive(
  text: string,
): ReturnType<InstructionParser> {
  const match = /^set all of your (?<target>.+) as active\.?$/i.exec(text);
  const targetText = match?.groups?.["target"];
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
      type: "activate",
      target: {
        type: "all",
        player: "self",
        zone: "characterArea",
        filter: parsedTarget.filter,
      },
    },
    evidence: [
      "instruction:activate",
      "cardinality:all",
      "player:self",
      "zone:characterArea",
      ...parsedTarget.evidence,
      "state:active",
    ],
    rest: "",
  };
}

function parseSetYourLeaderActive(text: string): ReturnType<InstructionParser> {
  const match =
    /^set your (?:\{(?<type>[^}]+)\} type )?Leader(?: \[(?<name>[^\]]+)\])? as active\.?$/i.exec(
      text,
    );
  if (match === null) {
    return undefined;
  }
  const name = match.groups?.["name"];
  const type = match.groups?.["type"];

  if (name !== undefined || type !== undefined) {
    const filter: CardFilter = {
      categories: ["leader"],
      ...(name === undefined ? {} : { names: [name] }),
      ...(type === undefined ? {} : { typesAny: [type] }),
    };

    return {
      effect: {
        type: "activate",
        target: {
          type: "all",
          player: "self",
          zone: "leaderArea",
          filter,
        },
      },
      evidence: [
        "instruction:activate",
        "target:yourLeader",
        "player:self",
        "zone:leaderArea",
        "filter:category:leader",
        ...(name === undefined ? [] : (["filter:name"] as const)),
        ...(type === undefined ? [] : (["filter:type"] as const)),
        "state:active",
      ],
      rest: "",
    };
  }

  return {
    effect: {
      type: "activate",
      target: { type: "myLeader" },
    },
    evidence: ["instruction:activate", "target:yourLeader", "state:active"],
    rest: "",
  };
}

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
