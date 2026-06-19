import type { Comparator, Condition } from "@optcg/types";

import { parseCardFilterPredicates } from "../../filters/index.js";
import type { PrimitiveEvidence } from "../../types.js";
import {
  continuousDuration,
  continuousDurationEvidence,
  type ContinuousInstructionParser,
} from "./shared.js";

export const selfCannotAttackPrimitive = {
  primitiveId: "instruction:preventActivation",
  childPrimitiveIds: [
    "target:thisCard",
    "target:thisCharacter",
    "duration:whileSourceOnField",
    "duration:whileConditionTrue",
  ],
} as const;

export const parseSelfCannotAttackInstruction: ContinuousInstructionParser = (
  input,
  context,
) => {
  const unless = parseSelfCannotAttackUnlessInstruction(input, context);
  if (unless !== undefined) {
    return unless;
  }

  const match = /^This (?<subject>Leader|Character) cannot attack\.?$/i.exec(
    input.text,
  );
  const subject = match?.groups?.["subject"]?.toLowerCase();
  if (subject !== "leader" && subject !== "character") {
    return undefined;
  }

  return {
    effect: {
      type: "cannotAttack",
      target: { type: "self" },
      duration: continuousDuration(context.condition),
    },
    evidence: [
      "instruction:preventActivation",
      subject === "character" ? "target:thisCharacter" : "target:thisCard",
      continuousDurationEvidence(context.condition),
    ],
    rest: "",
  };
};

export const parseAllCharactersRefreshLockInstruction: ContinuousInstructionParser =
  (input, context) => {
    const match =
      /^all (?<target>.+?) do not become active in your and your opponent's Refresh Phases\.?$/iu.exec(
        input.text.trim(),
      );
    const targetText = match?.groups?.["target"];
    if (targetText === undefined) {
      return undefined;
    }

    const predicates = parseCardFilterPredicates(
      { text: targetText },
      { powerSemantics: "current" },
    );
    if (
      predicates === undefined ||
      predicates.rest.trim().length > 0 ||
      predicates.filter.categories?.[0] !== "character"
    ) {
      return undefined;
    }

    const duration = continuousDuration(context.condition);
    const effect = (player: "self" | "opponent") =>
      ({
        type: "cannotBecomeActive" as const,
        target: {
          type: "all" as const,
          player,
          zone: "characterArea" as const,
          filter: predicates.filter,
        },
        duration,
      }) as const;

    return {
      effect: {
        type: "sequence",
        effects: [
          { connector: "always", effect: effect("self") },
          { connector: "always", effect: effect("opponent") },
        ],
      },
      evidence: [
        "instruction:preventActivation",
        "cardinality:all",
        "player:self",
        "player:opponent",
        "target:yourCharacters",
        "target:opponentCharacters",
        "zone:characterArea",
        ...predicates.evidence,
        continuousDurationEvidence(context.condition),
      ],
      rest: "",
    };
  };

export const parseAllCharactersCannotAttackInstruction: ContinuousInstructionParser =
  (input, context) => {
    const match =
      /^all Characters with a cost of (?<first>[1-9]\d*) or (?<second>[1-9]\d*) cannot attack\.?$/iu.exec(
        input.text.trim(),
      );
    const firstText = match?.groups?.["first"];
    const secondText = match?.groups?.["second"];
    if (firstText === undefined || secondText === undefined) {
      return undefined;
    }

    return {
      effect: {
        type: "cannotAttack",
        target: {
          type: "all",
          player: "anyPlayer",
          zone: "characterArea",
          filter: {
            categories: ["character"],
            anyOf: [
              { cost: { op: "eq", value: Number.parseInt(firstText, 10) } },
              { cost: { op: "eq", value: Number.parseInt(secondText, 10) } },
            ],
          },
        },
        duration: continuousDuration(context.condition),
      },
      evidence: [
        "instruction:preventActivation",
        "cardinality:all",
        "player:any",
        "target:anyCharacters",
        "filter:category:character",
        "filter:cost",
        "condition:comparator:eq",
        "condition:threshold:positiveInteger",
        continuousDurationEvidence(context.condition),
      ],
      rest: "",
    };
  };

export const parseOpponentAttackOnlyNamedCharacterInstruction: ContinuousInstructionParser =
  (input, context) => {
    const match =
      /^your opponent cannot attack any card other than the Character \[(?<name>[^\]]+)\]\.?$/iu.exec(
        input.text,
      );
    const name = match?.groups?.["name"]?.trim();
    if (name === undefined || name.length === 0) {
      return undefined;
    }

    const duration = continuousDuration(context.condition);
    return {
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "cannotAttackTarget",
              target: { type: "player", player: "opponent" },
              attackTarget: {
                player: "self",
                zone: "leaderArea",
                filter: { categories: ["leader"] },
              },
              duration,
            },
          },
          {
            connector: "always",
            effect: {
              type: "cannotAttackTarget",
              target: { type: "player", player: "opponent" },
              attackTarget: {
                player: "self",
                zone: "characterArea",
                filter: { categories: ["character"], nameNot: [name] },
              },
              duration,
            },
          },
        ],
      },
      evidence: [
        "instruction:cannotAttackTarget",
        "player:opponent",
        "player:self",
        "zone:leaderArea",
        "filter:category:leader",
        "zone:characterArea",
        "filter:category:character",
        "filter:nameNot",
        continuousDurationEvidence(context.condition),
      ],
      rest: "",
    };
  };

const combineConditions = (
  ...conditions: readonly (Condition | undefined)[]
): Condition | undefined => {
  const present = conditions.filter(
    (condition): condition is Condition => condition !== undefined,
  );
  if (present.length === 0) {
    return undefined;
  }
  if (present.length === 1) {
    return present[0];
  }
  return { type: "and", conditions: present };
};

const parseAnyPlayerFieldPresenceCondition = (
  text: string,
):
  | {
      readonly condition: Condition;
      readonly evidence: readonly PrimitiveEvidence[];
    }
  | undefined => {
  const match = /^there (?:is|are)\s+(?<predicate>.+)$/iu.exec(text);
  const predicateText = match?.groups?.["predicate"]?.trim();
  if (predicateText === undefined) {
    return undefined;
  }

  const predicates = parseCardFilterPredicates(
    { text: predicateText.replace(/^(?:a|an)\s+/iu, "") },
    { powerSemantics: "current" },
  );
  if (predicates === undefined || predicates.rest.trim().length > 0) {
    return undefined;
  }

  return {
    condition: {
      type: "or",
      conditions: [
        {
          type: "fieldCount",
          player: "self",
          filter: predicates.filter,
          op: "gte",
          value: 1,
        },
        {
          type: "fieldCount",
          player: "opponent",
          filter: predicates.filter,
          op: "gte",
          value: 1,
        },
      ],
    },
    evidence: [
      "composition:conditionOr",
      "condition:fieldCount",
      "condition:opponentFieldCount",
      "condition:comparator:gte",
      "condition:threshold:positiveInteger",
      "player:self",
      "player:opponent",
      ...predicates.evidence,
    ],
  };
};

const parseLeadingCountComparison = (
  text: string,
):
  | {
      readonly op: Comparator;
      readonly value: number;
      readonly evidence: readonly PrimitiveEvidence[];
      readonly rest: string;
    }
  | undefined => {
  const match =
    /^(?<value>[1-9]\d*)(?: (?<direction>or more|or less))?\b\s*(?<rest>.*)$/iu.exec(
      text,
    );
  const valueText = match?.groups?.["value"];
  const direction = match?.groups?.["direction"];
  const restText = match?.groups?.["rest"];
  if (valueText === undefined) {
    return undefined;
  }
  const op: Comparator =
    direction === undefined
      ? "eq"
      : direction.toLowerCase() === "or more"
        ? "gte"
        : "lte";
  const comparatorEvidence =
    op === "gte"
      ? "condition:comparator:gte"
      : op === "lte"
        ? "condition:comparator:lte"
        : "condition:comparator:eq";
  return {
    op,
    value: Number.parseInt(valueText, 10),
    evidence: [comparatorEvidence, "condition:threshold:positiveInteger"],
    rest: restText?.trim() ?? "",
  };
};

const parseOpponentFieldCountCondition = (
  text: string,
):
  | {
      readonly condition: Condition;
      readonly evidence: readonly PrimitiveEvidence[];
    }
  | undefined => {
  const match = /^your opponent has\s+(?<comparison>.+)$/iu.exec(text);
  const comparisonText = match?.groups?.["comparison"];
  if (comparisonText === undefined) {
    return undefined;
  }
  const comparison = parseLeadingCountComparison(comparisonText);
  if (comparison === undefined) {
    return undefined;
  }

  const predicates = parseCardFilterPredicates(
    { text: comparison.rest },
    { powerSemantics: "current" },
  );
  if (predicates === undefined || predicates.rest.trim().length > 0) {
    return undefined;
  }

  return {
    condition: {
      type: "fieldCount",
      player: "opponent",
      filter: predicates.filter,
      op: comparison.op,
      value: comparison.value,
    },
    evidence: [
      "condition:opponentFieldCount",
      ...comparison.evidence,
      "player:opponent",
      ...predicates.evidence,
    ],
  };
};

const parseUnlessCondition = (
  text: string,
):
  | {
      readonly condition: Condition;
      readonly evidence: readonly PrimitiveEvidence[];
    }
  | undefined => {
  const opponentFieldCount = parseOpponentFieldCountCondition(text);
  if (opponentFieldCount !== undefined) {
    return opponentFieldCount;
  }
  return parseAnyPlayerFieldPresenceCondition(text);
};

const parseSelfCannotAttackUnlessInstruction: ContinuousInstructionParser = (
  input,
  context,
) => {
  const match =
    /^This (?<subject>Leader|Character) cannot attack unless (?<condition>.+?)\.?$/iu.exec(
      input.text,
    );
  const subject = match?.groups?.["subject"]?.toLowerCase();
  const conditionText = match?.groups?.["condition"]?.trim();
  if (
    (subject !== "leader" && subject !== "character") ||
    conditionText === undefined
  ) {
    return undefined;
  }

  const parsedContextCondition = context.parseCondition?.(conditionText);
  const unlessCondition =
    parsedContextCondition === undefined
      ? parseUnlessCondition(conditionText)
      : {
          condition: parsedContextCondition.condition,
          evidence: parsedContextCondition.evidence,
        };
  if (unlessCondition === undefined) {
    return undefined;
  }

  const activeCondition = combineConditions(context.condition, {
    type: "not",
    condition: unlessCondition.condition,
  });

  return {
    effect: {
      type: "cannotAttack",
      target: { type: "self" },
      duration: continuousDuration(activeCondition),
    },
    evidence: [
      "instruction:preventActivation",
      subject === "character" ? "target:thisCharacter" : "target:thisCard",
      ...unlessCondition.evidence,
      "composition:conditionNot",
      ...(context.condition === undefined
        ? []
        : (["composition:conditionAnd"] as const)),
      continuousDurationEvidence(activeCondition),
    ],
    rest: "",
  };
};
