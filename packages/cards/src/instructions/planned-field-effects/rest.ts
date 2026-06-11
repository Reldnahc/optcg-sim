import { parseUpToCardinality } from "../../cardinality/index.js";
import {
  parseOpponentCardsTarget,
  parseOpponentCharactersOrDonCardsTarget,
  parseOpponentCharactersTarget,
  parseOpponentDonCardsTarget,
  parseOpponentLeaderOrCharacterCardsTarget,
} from "../../targets/index.js";
import type { InstructionParser } from "../../types.js";
import {
  thatCharacterSavedTarget,
  thatCharacterSelectionId,
} from "./shared.js";

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

export const parseRestOpponentCharactersInstruction: InstructionParser = (
  input,
) => {
  const actionMatch = /^Rest\s+(?<rest>.*)$/i.exec(input.text);
  const actionRest = actionMatch?.groups?.["rest"];
  if (actionRest === undefined) {
    return undefined;
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
    effect: {
      type: "sequence",
      effects: [
        {
          id: "select:that-character",
          connector: "always",
          saveResultAs: thatCharacterSelectionId,
          effect: {
            type: "selectTargets",
            request: {
              timing: "onResolution",
              chooser: "self",
              player: "opponent",
              zone: "characterArea",
              filter: target.filter ?? { categories: ["character"] },
              min: cardinality.cardinality.min,
              max: cardinality.cardinality.max,
              allowFewerIfUnavailable: true,
              visibility: "public",
            },
          },
        },
        {
          connector: "then",
          effect: {
            type: "rest",
            target: thatCharacterSavedTarget,
          },
        },
      ],
    },
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

export const parseRestOpponentCharactersOrDonCardsInstruction: InstructionParser =
  (input) => {
    const actionRest = /^Rest\s+(?<rest>.*)$/i.exec(input.text)?.groups?.[
      "rest"
    ];
    if (actionRest === undefined) {
      return undefined;
    }

    const cardinality = parseUpToCardinality({ text: actionRest });
    if (cardinality === undefined) {
      return undefined;
    }

    const target = parseOpponentCharactersOrDonCardsTarget({
      text: cardinality.rest,
    });
    if (
      target === undefined ||
      target.target?.type !== "chooseFromZones" ||
      (target.rest.length > 0 && target.rest !== ".")
    ) {
      return undefined;
    }

    return {
      effect: {
        type: "rest",
        target: {
          type: "chooseFromZones",
          request: {
            ...target.target.request,
            min: cardinality.cardinality.min,
            max: cardinality.cardinality.max,
            allowFewerIfUnavailable: true,
          },
        },
      },
      evidence: [
        "instruction:rest",
        ...cardinality.evidence,
        "chooser:self:upTo",
        ...target.evidence,
      ],
      rest: "",
    };
  };

export const parseRestOpponentDonCardsInstruction: InstructionParser = (
  input,
) => {
  const actionRest = /^Rest\s+(?<rest>.*)$/i.exec(input.text)?.groups?.["rest"];
  if (actionRest === undefined) {
    return undefined;
  }

  const cardinality = parseUpToCardinality({ text: actionRest });
  if (cardinality === undefined) {
    return undefined;
  }

  const target = parseOpponentDonCardsTarget({ text: cardinality.rest });
  if (
    target === undefined ||
    target.target?.type !== "chooseFromZones" ||
    (target.rest.length > 0 && target.rest !== ".")
  ) {
    return undefined;
  }

  return {
    effect: {
      type: "rest",
      target: {
        type: "chooseFromZones",
        request: {
          ...target.target.request,
          min: cardinality.cardinality.min,
          max: cardinality.cardinality.max,
          allowFewerIfUnavailable: true,
        },
      },
    },
    evidence: [
      "instruction:rest",
      ...cardinality.evidence,
      "chooser:self:upTo",
      ...target.evidence,
    ],
    rest: "",
  };
};

export const parseRestOpponentCardsInstruction: InstructionParser = (input) => {
  const actionRest = /^Rest\s+(?<rest>.*)$/i.exec(input.text)?.groups?.["rest"];
  if (actionRest === undefined) {
    return undefined;
  }

  const cardinality = parseUpToCardinality({ text: actionRest });
  if (cardinality === undefined) {
    return undefined;
  }

  const target = parseOpponentCardsTarget({ text: cardinality.rest });
  if (
    target === undefined ||
    target.target?.type !== "chooseFromZones" ||
    (target.rest.length > 0 && target.rest !== ".")
  ) {
    return undefined;
  }

  return {
    effect: {
      type: "rest",
      target: {
        type: "chooseFromZones",
        request: {
          ...target.target.request,
          min: cardinality.cardinality.min,
          max: cardinality.cardinality.max,
          allowFewerIfUnavailable: true,
        },
      },
    },
    evidence: [
      "instruction:rest",
      ...cardinality.evidence,
      "chooser:self:upTo",
      ...target.evidence,
    ],
    rest: "",
  };
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

    const cardinality = parseUpToCardinality({ text: actionRest });
    if (cardinality === undefined) {
      return undefined;
    }

    const target = parseOpponentLeaderOrCharacterCardsTarget({
      text: cardinality.rest,
    });
    if (
      target === undefined ||
      target.target?.type !== "chooseFromZones" ||
      (target.rest.length > 0 && target.rest !== ".")
    ) {
      return undefined;
    }

    return {
      effect: {
        type: "rest",
        target: {
          type: "chooseFromZones",
          request: {
            ...target.target.request,
            min: cardinality.cardinality.min,
            max: cardinality.cardinality.max,
            allowFewerIfUnavailable: true,
          },
        },
      },
      evidence: [
        "instruction:rest",
        ...cardinality.evidence,
        "chooser:self:upTo",
        ...target.evidence,
      ],
      rest: "",
    };
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
