import type { CardFilter, SelectionId } from "@optcg/types";

import { parseUpToCardinality } from "../cardinality/index.js";
import { parseCardFilterPredicates } from "../filters/index.js";
import { parseYourLeaderOrCharacterCardsTarget } from "../targets/index.js";
import type { InstructionParser, PrimitiveEvidence } from "../types.js";
import { parseSetDonActiveInstruction } from "./don-movement/set-active.js";

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

  const selfOrDonActivation = parseSetThisCharacterOrDonActive(input.text);
  if (selfOrDonActivation !== undefined) {
    return selfOrDonActivation;
  }

  const compoundCharactersAndLeaderActivation =
    parseCompoundCharactersAndLeaderActivation(input.text);
  if (compoundCharactersAndLeaderActivation !== undefined) {
    return compoundCharactersAndLeaderActivation;
  }

  const compoundFieldAndDonActivation = parseCompoundFieldAndDonActivation(
    input.text,
  );
  if (compoundFieldAndDonActivation !== undefined) {
    return compoundFieldAndDonActivation;
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
  const leaderTarget = parseYourLeaderSelectionTarget(quantity.rest);
  if (leaderTarget !== undefined) {
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
                zone: "leaderArea",
                player: "self",
                filter: leaderTarget.filter,
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
                zone: "leaderArea",
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
        "zone:leaderArea",
        ...leaderTarget.evidence,
        "state:active",
        "composition:selectThenApply",
      ],
      rest: "",
    };
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

  const parsedTarget = parseActivationCharacterFilter(targetText);
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

function parseActivationCharacterFilter(
  text: string,
): ReturnType<typeof parseCardFilterPredicates> {
  const parsed = parseCardFilterPredicates(
    { text },
    { powerSemantics: "current" },
  );
  if (parsed !== undefined) {
    return parsed;
  }

  const rested = /^rested\s+(?<rest>.+)$/iu.exec(text.trim());
  const filterText = rested?.groups?.["rest"];
  if (filterText === undefined) {
    return undefined;
  }
  const filtered = parseCardFilterPredicates(
    { text: filterText },
    { powerSemantics: "current" },
  );
  if (filtered === undefined) {
    return undefined;
  }
  return {
    ...filtered,
    filter: { ...filtered.filter, state: "rested" },
    evidence: ["filter:state:rested", ...filtered.evidence],
  };
}

function parseYourLeaderSelectionTarget(text: string):
  | {
      readonly filter: CardFilter;
      readonly evidence: readonly PrimitiveEvidence[];
    }
  | undefined {
  const match = /^of your (?<predicate>.+?Leader(?: cards?)?)\.?$/iu.exec(
    text.trim(),
  );
  const predicateText = match?.groups?.["predicate"];
  if (predicateText === undefined) {
    return undefined;
  }
  const predicates = parseCardFilterPredicates(
    { text: predicateText },
    { powerSemantics: "current" },
  );
  if (
    predicates === undefined ||
    predicates.rest.trim().length > 0 ||
    !isLeaderFilter(predicates.filter)
  ) {
    return undefined;
  }

  return {
    filter: predicates.filter,
    evidence: predicates.evidence,
  };
}

function parseSetThisCharacterActive(
  text: string,
): ReturnType<InstructionParser> {
  const match =
    /^set this (?<subject>Character|Leader) as active(?<delayed> at the end of this turn)?\.?$/i.exec(
      text,
    );
  if (match === null) {
    return undefined;
  }
  const subject = match.groups?.["subject"]?.toLowerCase();

  const effect = {
    type: "activate" as const,
    target:
      subject === "leader"
        ? ({ type: "myLeader" } as const)
        : ({ type: "self" } as const),
  };
  if (match.groups?.["delayed"] !== undefined) {
    return {
      effect: {
        type: "delayed",
        timing: { type: "endOfTurn", turn: "current" },
        effect,
      },
      evidence: [
        "instruction:activate",
        subject === "leader" ? "target:yourLeader" : "target:thisCharacter",
        "state:active",
        "duration:endOfTurn",
        "composition:delayed",
      ],
      rest: "",
    };
  }

  return {
    effect,
    evidence: [
      "instruction:activate",
      subject === "leader" ? "target:yourLeader" : "target:thisCharacter",
      "state:active",
    ],
    rest: "",
  };
}

function parseSetThisCharacterOrDonActive(
  text: string,
): ReturnType<InstructionParser> {
  const match =
    /^set this Character or (?<donTarget>up to [1-9]\d* of your DON!! cards) as active\.?$/iu.exec(
      text,
    );
  const donTarget = match?.groups?.["donTarget"];
  if (donTarget === undefined) {
    return undefined;
  }

  const donActivation = parseSetDonActiveInstruction({
    text: `set ${donTarget} as active`,
  });
  if (donActivation === undefined) {
    return undefined;
  }

  return {
    effect: {
      type: "sequence",
      effects: [
        {
          connector: "always",
          effect: {
            type: "choice",
            chooser: "self",
            min: 1,
            max: 1,
            options: [
              {
                id: "choice:activate-this-character",
                label: "Set this Character as active.",
                effect: {
                  type: "activate",
                  target: { type: "self" },
                },
              },
              {
                id: "choice:activate-don",
                label: "Set DON!! cards as active.",
                effect: donActivation.effect,
              },
            ],
          },
        },
      ],
    },
    evidence: [
      "instruction:activate",
      "target:thisCharacter",
      "state:active",
      "composition:chooseOne",
      "choice:option",
      "choice:option",
      ...donActivation.evidence,
    ],
    rest: "",
  };
}

function parseCompoundCharactersAndLeaderActivation(
  text: string,
): ReturnType<InstructionParser> {
  const match =
    /^set (?<fieldTarget>up to [1-9]\d* of your .+? Characters) and your Leader as active\.?$/iu.exec(
      text,
    );
  const fieldTarget = match?.groups?.["fieldTarget"];
  if (fieldTarget === undefined) {
    return undefined;
  }

  const fieldActivation = parseSetFieldActiveInstruction({
    text: `set ${fieldTarget} as active`,
  });
  if (fieldActivation === undefined) {
    return undefined;
  }

  return {
    effect: {
      type: "sequence",
      effects: [
        {
          id: "activate:field-targets",
          connector: "always",
          effect: fieldActivation.effect,
        },
        {
          id: "activate:leader",
          connector: "then",
          effect: { type: "activate", target: { type: "myLeader" } },
        },
      ],
    },
    evidence: [
      "instruction:activate",
      "composition:compoundActivation",
      ...fieldActivation.evidence,
      "target:yourLeader",
      "state:active",
    ],
    rest: "",
  };
}

function parseCompoundFieldAndDonActivation(
  text: string,
): ReturnType<InstructionParser> {
  const match =
    /^set (?<fieldTarget>up to [1-9]\d* of your .+? Characters) and (?<donTarget>up to [1-9]\d* of your DON!! cards) as active\.?$/iu.exec(
      text,
    );
  const fieldTarget = match?.groups?.["fieldTarget"];
  const donTarget = match?.groups?.["donTarget"];
  if (fieldTarget === undefined || donTarget === undefined) {
    return undefined;
  }

  const fieldActivation = parseSetFieldActiveInstruction({
    text: `set ${fieldTarget} as active`,
  });
  const donActivation = parseSetDonActiveInstruction({
    text: `set ${donTarget} as active`,
  });
  if (fieldActivation === undefined || donActivation === undefined) {
    return undefined;
  }

  return {
    effect: {
      type: "sequence",
      effects: [
        {
          id: "activate:field-targets",
          connector: "always",
          effect: fieldActivation.effect,
        },
        {
          id: "activate:don-targets",
          connector: "then",
          effect: donActivation.effect,
        },
      ],
    },
    evidence: [
      "instruction:activate",
      "composition:compoundActivation",
      ...fieldActivation.evidence,
      ...donActivation.evidence,
    ],
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
    /^set your (?:(?:\[(?<prefixName>[^\]]+)\] )|(?:\{(?<type>[^}]+)\} type ))?Leader(?: \[(?<suffixName>[^\]]+)\])? as active\.?$/i.exec(
      text,
    );
  if (match === null) {
    return undefined;
  }
  const prefixName = match.groups?.["prefixName"];
  const suffixName = match.groups?.["suffixName"];
  const name = prefixName ?? suffixName;
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

function isLeaderFilter(
  filter: CardFilter,
): filter is CardFilter & { readonly categories: readonly ["leader"] } {
  return filter.categories?.includes("leader") === true;
}
