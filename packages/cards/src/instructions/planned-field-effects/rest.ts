import type { Effect, Target } from "@optcg/types";

import { parseUpToCardinality } from "../../cardinality/index.js";
import {
  parseAllFieldTarget,
  parseOpponentCardsTarget,
  parseOpponentCharactersOrDonCardsTarget,
  parseOpponentCharactersTarget,
  parseOpponentDonCardsTarget,
  parseOpponentLeaderOrCharacterCardsTarget,
  type FieldTargetParser,
} from "../../targets/index.js";
import type {
  InstructionParser,
  InstructionParseResult,
  ParseInput,
  PrimitiveEvidence,
} from "../../types.js";
import { selectThenApplyFieldTarget } from "../effect-builders.js";
import { thatCharacterSelectionId } from "./shared.js";

export const restOpponentCharactersPrimitive = {
  primitiveId: "instruction:rest",
  childPrimitiveIds: ["cardinality:upTo", "target:opponentCharacters"],
} as const;

export const restOpponentCardsPrimitive = {
  primitiveId: "instruction:rest",
  childPrimitiveIds: ["cardinality:upTo", "target:opponentCards"],
} as const;

export const restOpponentLeaderOrCharactersPrimitive = {
  primitiveId: "instruction:rest",
  childPrimitiveIds: ["cardinality:upTo", "target:opponentLeaderOrCharacters"],
} as const;

export const restOpponentCharactersOrDonCardsPrimitive = {
  primitiveId: "instruction:rest",
  childPrimitiveIds: [
    "cardinality:upTo",
    "target:opponentCharactersOrDonCards",
  ],
} as const;

export const restOpponentDonCardsPrimitive = {
  primitiveId: "instruction:rest",
  childPrimitiveIds: ["cardinality:upTo", "target:opponentDonCards"],
} as const;

export const restThisCharacterAndOpponentCharactersPrimitive = {
  primitiveId: "instruction:rest",
  childPrimitiveIds: [
    "target:thisCharacter",
    "cardinality:upTo",
    "target:opponentCharacters",
    "composition:sequence",
  ],
} as const;

export const restThisCharacterPrimitive = {
  primitiveId: "instruction:rest",
  childPrimitiveIds: ["target:thisCharacter"],
} as const;

export const parseRestOpponentCharactersInstruction: InstructionParser = (
  input,
) => {
  const actionMatch = /^Rest\s+(?<rest>.*)$/i.exec(input.text);
  const actionRest = actionMatch?.groups?.["rest"];
  if (actionRest === undefined) {
    return undefined;
  }

  const allTarget = parseAllFieldTarget({ text: actionRest });
  if (
    allTarget !== undefined &&
    allTarget.target.type === "all" &&
    allTarget.target.player === "opponent" &&
    (allTarget.rest.length === 0 || allTarget.rest === ".")
  ) {
    return {
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: { type: "rest", target: allTarget.target },
          },
        ],
      },
      evidence: ["instruction:rest", ...allTarget.evidence],
      rest: "",
    };
  }

  const cardinality = parseUpToCardinality({ text: actionRest });
  if (cardinality === undefined) {
    return undefined;
  }

  const target = parseOpponentCharactersTarget({ text: cardinality.rest });
  if (target === undefined || (target.rest.length > 0 && target.rest !== ".")) {
    return undefined;
  }

  return {
    effect: selectThenApplyFieldTarget({
      selectionId: thatCharacterSelectionId,
      selectId: "select:that-character",
      player: "opponent",
      zone: "characterArea",
      filter: target.filter ?? { categories: ["character"] },
      min: cardinality.cardinality.min,
      max: cardinality.cardinality.max,
      apply: (target) => ({ type: "rest", target }),
    }),
    evidence: [
      "instruction:rest",
      ...cardinality.evidence,
      "chooser:self:upTo",
      ...target.evidence,
    ],
    rest: "",
  };
};

export const parseRestThisCharacterAndOpponentCharactersInstruction: InstructionParser =
  (input) => {
    const match =
      /^Rest this Character and (?<opponent>up to [1-9]\d* of your opponent's Characters?.*)$/iu.exec(
        input.text,
      );
    const opponentText = match?.groups?.["opponent"];
    if (opponentText === undefined) {
      return undefined;
    }
    const opponentRest = parseRestOpponentCharactersInstruction({
      text: `Rest ${opponentText}`,
    });
    if (opponentRest === undefined || opponentRest.rest.length > 0) {
      return undefined;
    }

    return {
      effect: {
        type: "sequence",
        effects: [
          {
            id: "rest:this-character",
            connector: "always",
            effect: {
              type: "rest",
              target: { type: "self" },
            },
          },
          {
            id: "rest:opponent-characters",
            connector: "then",
            effect: opponentRest.effect,
          },
        ],
      },
      evidence: [
        "instruction:rest",
        "target:thisCharacter",
        ...opponentRest.evidence,
        "composition:sequence",
      ],
      rest: "",
    };
  };

export const parseRestThisCharacterInstruction: InstructionParser = (input) => {
  if (!/^Rest this Character\.?$/iu.test(input.text)) {
    return undefined;
  }

  return {
    effect: {
      type: "rest",
      target: { type: "self" },
    },
    evidence: ["instruction:rest", "target:thisCharacter"],
    rest: "",
  };
};

export const parseRestOpponentCharactersOrDonCardsInstruction: InstructionParser =
  (input) => {
    return parseUpToRestChooseFromZonesInstruction(
      input,
      parseOpponentCharactersOrDonCardsTarget,
    );
  };

export const parseRestOpponentDonCardsInstruction: InstructionParser = (
  input,
) => {
  const opponentActionRest = /^your opponent rests?\s+(?<rest>.*)$/i.exec(
    input.text,
  )?.groups?.["rest"];
  if (opponentActionRest !== undefined) {
    const cardinality = /^1\b\s*(?<rest>.*)$/i.exec(opponentActionRest);
    const cardinalityRest = cardinality?.groups?.["rest"];
    if (cardinalityRest === undefined) {
      return undefined;
    }
    const normalizedTargetText = cardinalityRest.replace(
      /^of their\s+/iu,
      "of your opponent's ",
    );
    const target = parseOpponentDonCardsTarget({ text: normalizedTargetText });
    if (
      target === undefined ||
      target.target?.type !== "chooseFromZones" ||
      hasUnsupportedRest(target.rest)
    ) {
      return undefined;
    }

    return buildRestChooseFromZonesInstruction({
      target: target.target,
      min: 1,
      max: 1,
      chooser: "opponent",
      evidence: ["cardinality:exact", "chooser:opponent"],
      targetEvidence: target.evidence,
    });
  }

  const actionRest = /^Rest\s+(?<rest>.*)$/i.exec(input.text)?.groups?.["rest"];
  if (actionRest === undefined) {
    return undefined;
  }

  return parseUpToRestChooseFromZonesTarget(
    actionRest,
    parseOpponentDonCardsTarget,
  );
};

export const parseRestOpponentCardsInstruction: InstructionParser = (input) => {
  return parseUpToRestChooseFromZonesInstruction(
    input,
    parseOpponentCardsTarget,
  );
};

export const parseRestOpponentLeaderOrCharactersInstruction: InstructionParser =
  (input) => {
    const actionRest = /^Rest\s+(?<rest>.*)$/i.exec(input.text)?.groups?.[
      "rest"
    ];
    if (actionRest === undefined) {
      return undefined;
    }

    const exactLeader = parseExactOpponentLeaderTarget(actionRest);
    if (exactLeader !== undefined) {
      return exactLeader;
    }

    return parseUpToRestChooseFromZonesTarget(
      actionRest,
      parseOpponentLeaderOrCharacterCardsTarget,
    );
  };

function parseExactOpponentLeaderTarget(
  text: string,
): ReturnType<InstructionParser> {
  if (!/^your opponent's Leader\.?$/iu.test(text.trim())) {
    return undefined;
  }

  return {
    effect: {
      type: "rest",
      target: { type: "opponentLeader" },
    },
    evidence: ["instruction:rest", "target:opponentLeader"],
    rest: "",
  };
}

type ChooseFromZonesTarget = Extract<Target, { type: "chooseFromZones" }>;
type RestEffect = Extract<Effect, { type: "rest" }>;

function parseUpToRestChooseFromZonesInstruction(
  input: ParseInput,
  targetParser: FieldTargetParser,
): InstructionParseResult | undefined {
  const actionRest = /^Rest\s+(?<rest>.*)$/i.exec(input.text)?.groups?.["rest"];
  if (actionRest === undefined) {
    return undefined;
  }

  return parseUpToRestChooseFromZonesTarget(actionRest, targetParser);
}

function parseUpToRestChooseFromZonesTarget(
  text: string,
  targetParser: FieldTargetParser,
): InstructionParseResult | undefined {
  const cardinality = parseUpToCardinality({ text });
  if (cardinality === undefined) {
    return undefined;
  }

  const target = targetParser({ text: cardinality.rest });
  if (
    target === undefined ||
    target.target?.type !== "chooseFromZones" ||
    hasUnsupportedRest(target.rest)
  ) {
    return undefined;
  }

  return buildRestChooseFromZonesInstruction({
    target: target.target,
    min: cardinality.cardinality.min,
    max: cardinality.cardinality.max,
    chooser: "self",
    evidence: [...cardinality.evidence, "chooser:self:upTo"],
    targetEvidence: target.evidence,
  });
}

function buildRestChooseFromZonesInstruction(options: {
  readonly target: ChooseFromZonesTarget;
  readonly min: number;
  readonly max: number;
  readonly chooser: "self" | "opponent";
  readonly evidence: readonly PrimitiveEvidence[];
  readonly targetEvidence: readonly PrimitiveEvidence[];
}): InstructionParseResult {
  return {
    effect: buildRestChooseFromZonesEffect(options),
    evidence: [
      "instruction:rest",
      ...options.evidence,
      ...options.targetEvidence,
    ],
    rest: "",
  };
}

function buildRestChooseFromZonesEffect(options: {
  readonly target: ChooseFromZonesTarget;
  readonly min: number;
  readonly max: number;
  readonly chooser: "self" | "opponent";
}): RestEffect {
  return {
    type: "rest",
    target: {
      type: "chooseFromZones",
      request: {
        ...options.target.request,
        chooser: options.chooser,
        min: options.min,
        max: options.max,
        allowFewerIfUnavailable: true,
      },
    },
  };
}

function hasUnsupportedRest(rest: string): boolean {
  return rest.length > 0 && rest !== ".";
}
