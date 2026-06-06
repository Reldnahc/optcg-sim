import type { Duration } from "@optcg/types";

import { parseCardFilterPredicates } from "../filters/index.js";
import { parseUpToCardinality } from "../cardinality/index.js";
import {
  parseOpponentNextEndPhaseDuration,
  parseThisTurnDuration,
} from "../durations/index.js";
import {
  parseAllFieldTarget,
  parseOpponentCharactersTarget,
  parseYourCharactersTarget,
} from "../targets/index.js";
import type { InstructionParser, PrimitiveEvidence } from "../types.js";
import type {
  ContinuousInstructionContext,
  ContinuousInstructionParser,
} from "./continuous-field-effects.js";

export const modifyCostInstructionPrimitive = {
  primitiveId: "instruction:modifyCost",
  childPrimitiveIds: [
    "filter:type",
    "filter:category:character",
    "filter:cost",
    "zone:hand",
    "modifier:costReduction",
    "duration:whileConditionTrue",
  ],
} as const;

export const parseModifyCostInstruction: InstructionParser = (input) => {
  const fieldCostReduction = parseFieldCostReductionInstruction(input, {
    condition: undefined,
    requireExplicitDuration: true,
  });
  if (fieldCostReduction !== undefined) {
    return fieldCostReduction;
  }

  const match =
    /^The cost of playing\s+(?<filter>.+)\s+from your hand will be reduced by (?<value>[1-9]\d*)\.?$/i.exec(
      input.text,
    );
  const filterText = match?.groups?.["filter"];
  const valueText = match?.groups?.["value"];
  if (filterText === undefined || valueText === undefined) {
    return undefined;
  }

  const predicates = parseCardFilterPredicates({ text: filterText });
  if (predicates === undefined || predicates.rest.length > 0) {
    return undefined;
  }

  return {
    effect: {
      type: "modifyCost",
      player: "self",
      sourceZone: "hand",
      filter: predicates.filter,
      value: -Number.parseInt(valueText, 10),
      duration: {
        type: "whileConditionTrue",
        condition: { type: "yourTurn" },
      },
    },
    evidence: [
      "instruction:modifyCost",
      ...predicates.evidence,
      "zone:hand",
      "modifier:costReduction",
      "count:positiveInteger",
      "duration:whileConditionTrue",
    ],
    rest: "",
  };
};

export const parseTargetedModifyCostInstruction: InstructionParser = (
  input,
) => {
  const cardinality = parseUpToCardinality(input);
  if (cardinality === undefined) {
    return undefined;
  }

  const target = parseYourCharactersTarget({ text: cardinality.rest });
  if (target?.target === undefined) {
    return undefined;
  }

  const actionMatch = /^gains\s+(?<rest>.*)$/i.exec(target.rest);
  const modifierText = actionMatch?.groups?.["rest"];
  if (modifierText === undefined) {
    return undefined;
  }

  const modifier = parsePositiveCostModifier({ text: modifierText });
  if (modifier === undefined) {
    return undefined;
  }

  const duration = parseOpponentNextEndPhaseDuration({ text: modifier.rest });
  if (duration?.duration === undefined || duration.rest.length > 0) {
    return undefined;
  }

  return {
    effect: {
      type: "modifyCost",
      player: "self",
      target: target.target,
      value: modifier.value,
      duration: duration.duration,
    },
    evidence: [
      "instruction:modifyCost",
      ...cardinality.evidence,
      "chooser:self:upTo",
      ...target.evidence,
      ...modifier.evidence,
      ...duration.evidence,
    ],
    rest: "",
  };
};

export const parseSelfHandModifyCostInstruction: ContinuousInstructionParser = (
  input,
  context,
) => {
  if (context.condition === undefined) {
    return undefined;
  }

  const match =
    /^give this card in your hand\s+[−-](?<value>[1-9]\d*) cost\.?$/i.exec(
      input.text,
    );
  const valueText = match?.groups?.["value"];
  if (valueText === undefined) {
    return undefined;
  }

  return {
    effect: {
      type: "modifyCost",
      player: "self",
      sourceZone: "hand",
      target: { type: "self" },
      value: -Number.parseInt(valueText, 10),
      duration: {
        type: "whileConditionTrue",
        condition: context.condition,
      },
    },
    evidence: [
      "instruction:modifyCost",
      "target:thisCard",
      "zone:hand",
      "modifier:costReduction",
      "count:positiveInteger",
      "duration:whileConditionTrue",
    ],
    rest: "",
  };
};

export const parseContinuousFieldModifyCostInstruction: ContinuousInstructionParser =
  (input, context) =>
    parseFieldCostReductionInstruction(input, {
      condition: context.condition,
      requireExplicitDuration: false,
    });

function parseFieldCostReductionInstruction(
  input: { readonly text: string },
  options: {
    readonly condition: ContinuousInstructionContext["condition"];
    readonly requireExplicitDuration: boolean;
  },
): ReturnType<InstructionParser> {
  const actionMatch = /^give\s+(?<rest>.*)$/i.exec(input.text);
  const actionRest = actionMatch?.groups?.["rest"];
  if (actionRest === undefined) {
    return undefined;
  }

  const allTarget = parseAllFieldTarget({ text: actionRest });
  if (allTarget !== undefined) {
    const modifier = parseNegativeCostModifier({ text: allTarget.rest });
    if (modifier === undefined) {
      return undefined;
    }
    const duration = parseCostModifierDuration(modifier.rest, options);
    if (duration === undefined) {
      return undefined;
    }

    return {
      effect: {
        type: "modifyCost",
        player: "self",
        target: allTarget.target,
        value: modifier.value,
        duration: duration.duration,
      },
      evidence: [
        "instruction:modifyCost",
        ...allTarget.evidence,
        ...modifier.evidence,
        ...duration.evidence,
      ],
      rest: "",
    };
  }

  const cardinality = parseUpToCardinality({ text: actionRest });
  if (cardinality === undefined) {
    return undefined;
  }

  const target = parseOpponentCharactersTarget({ text: cardinality.rest });
  if (target === undefined) {
    return undefined;
  }

  const modifier = parseNegativeCostModifier({ text: target.rest });
  if (modifier === undefined) {
    return undefined;
  }
  const duration = parseCostModifierDuration(modifier.rest, options);
  if (duration === undefined) {
    return undefined;
  }

  return {
    effect: {
      type: "modifyCost",
      player: "self",
      target: {
        type: "choose",
        request: {
          timing: "onResolution",
          chooser: "self",
          player: "opponent",
          zone: "characterArea",
          min: cardinality.cardinality.min,
          max: cardinality.cardinality.max,
          allowFewerIfUnavailable: true,
          visibility: "public",
          filter: target.filter ?? { categories: ["character"] },
        },
      },
      value: modifier.value,
      duration: duration.duration,
    },
    evidence: [
      "instruction:modifyCost",
      ...cardinality.evidence,
      "chooser:self:upTo",
      ...target.evidence,
      ...modifier.evidence,
      ...duration.evidence,
    ],
    rest: "",
  };
}

function parseCostModifierDuration(
  text: string,
  options: {
    readonly condition: ContinuousInstructionContext["condition"];
    readonly requireExplicitDuration: boolean;
  },
):
  | {
      readonly duration: Duration;
      readonly evidence: readonly PrimitiveEvidence[];
    }
  | undefined {
  const explicit = parseThisTurnDuration({ text });
  if (explicit?.duration !== undefined && explicit.rest.length === 0) {
    return { duration: explicit.duration, evidence: explicit.evidence };
  }
  const normalized = text.trim();
  if (
    options.requireExplicitDuration ||
    (normalized.length > 0 && normalized !== ".")
  ) {
    return undefined;
  }
  return {
    duration:
      options.condition === undefined
        ? { type: "whileSourceOnField" }
        : { type: "whileConditionTrue", condition: options.condition },
    evidence: [
      options.condition === undefined
        ? "duration:whileSourceOnField"
        : "duration:whileConditionTrue",
    ],
  };
}

function parsePositiveCostModifier(input: { readonly text: string }):
  | {
      readonly value: number;
      readonly evidence: readonly PrimitiveEvidence[];
      readonly rest: string;
    }
  | undefined {
  const match = /^\+(?<value>[1-9]\d*) cost\b\s*(?<rest>.*)$/i.exec(input.text);
  const valueText = match?.groups?.["value"];
  const restText = match?.groups?.["rest"];
  if (valueText === undefined) {
    return undefined;
  }

  return {
    value: Number.parseInt(valueText, 10),
    evidence: ["modifier:positiveCost", "count:positiveInteger"],
    rest: restText?.trim() ?? "",
  };
}

function parseNegativeCostModifier(input: { readonly text: string }):
  | {
      readonly value: number;
      readonly evidence: readonly PrimitiveEvidence[];
      readonly rest: string;
    }
  | undefined {
  const match = /^[−-](?<value>[1-9]\d*) cost\b\s*(?<rest>.*)$/iu.exec(
    input.text,
  );
  const valueText = match?.groups?.["value"];
  const restText = match?.groups?.["rest"];
  if (valueText === undefined) {
    return undefined;
  }

  return {
    value: -Number.parseInt(valueText, 10),
    evidence: ["modifier:costReduction", "count:positiveInteger"],
    rest: restText?.trim() ?? "",
  };
}
