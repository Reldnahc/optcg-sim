import type { Effect, Target } from "@optcg/types";

import { parseUpToCardinality } from "../cardinality/index.js";
import {
  parseAllFieldTarget,
  parseOpponentFieldTarget,
} from "../targets/index.js";
import { chosenCharacterTarget } from "../targets/chosen-character.js";
import type { InstructionParser, PrimitiveEvidence } from "../types.js";

const koTargetSelectionId = "selected:ko-target";
const koOrReturnSelectionId = "selected:ko-or-return-target";
const koOrRestSelectionId = "selected:ko-or-rest-target";

export const koInstructionPrimitive = {
  primitiveId: "instruction:ko",
  childPrimitiveIds: [
    "cardinality:upTo",
    "target:opponentCharacters",
    "composition:selectThenApply",
  ],
} as const;

export const parseKoInstruction: InstructionParser = (input) => {
  const actionMatch = /^K\.O\.\s+(?<rest>.*)$/i.exec(input.text);
  const actionRest = actionMatch?.groups?.["rest"];
  if (actionRest === undefined) {
    return undefined;
  }

  if (/^it\.?$/iu.test(actionRest)) {
    return {
      effect: {
        type: "ko",
        target: chosenCharacterTarget(),
      },
      evidence: [
        "instruction:ko",
        "target:selectedCharacter",
        "composition:selectThenApply",
      ],
      rest: "",
    };
  }

  const composed = parseComposedKoTargets(actionRest);
  if (composed !== undefined) {
    return composed;
  }

  const alternate = parseKoOrReturnToOwnerHand(actionRest);
  if (alternate !== undefined) {
    return alternate;
  }

  const koOrRest = parseKoOrRest(actionRest);
  if (koOrRest !== undefined) {
    return koOrRest;
  }

  const allCharactersExceptSelf =
    /^all Characters other than this Character\.?$/i.exec(actionRest);
  if (allCharactersExceptSelf !== null) {
    return {
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "ko",
              target: {
                type: "all",
                zone: "characterArea",
                player: "self",
                filter: { categories: ["character"], excludeSelf: true },
              },
            },
          },
          {
            connector: "then",
            effect: {
              type: "ko",
              target: {
                type: "all",
                zone: "characterArea",
                player: "opponent",
                filter: { categories: ["character"], excludeSelf: true },
              },
            },
          },
        ],
      },
      evidence: [
        "expression:sequence",
        "instruction:ko",
        "cardinality:all",
        "player:any",
        "zone:characterArea",
        "filter:category:character",
        "filter:excludeSelf",
      ],
      rest: "",
    };
  }

  const allTarget = parseAllFieldTarget({ text: actionRest });
  if (
    allTarget !== undefined &&
    (allTarget.rest.length === 0 || allTarget.rest === ".")
  ) {
    return {
      effect: { type: "ko", target: allTarget.target },
      evidence: ["instruction:ko", ...allTarget.evidence],
      rest: "",
    };
  }

  const cardinality = parseUpToCardinality({ text: actionRest });
  if (cardinality === undefined) {
    return undefined;
  }

  const totalStatTarget = parseTotalStatLimitedKoTarget(cardinality.rest);
  const target =
    totalStatTarget?.target ??
    parseOpponentFieldTarget({ text: cardinality.rest });
  if (target === undefined || (target.rest.length > 0 && target.rest !== ".")) {
    return undefined;
  }
  const category = target.filter?.categories?.[0];
  const zone = category === "stage" ? "stageArea" : "characterArea";

  return {
    effect: selectThenApplyKoEffect({
      min: cardinality.cardinality.min,
      max: cardinality.cardinality.max,
      filter: target.filter ?? { categories: ["character"] },
      selectionConstraints: totalStatTarget?.selectionConstraints,
      zone,
      selectionId: koTargetSelectionId,
    }),
    evidence: [
      "instruction:ko",
      ...cardinality.evidence,
      "chooser:self:upTo",
      ...target.evidence,
      ...(totalStatTarget?.evidence ?? []),
      "composition:selectThenApply",
    ],
    rest: "",
  };
};

function parseTotalStatLimitedKoTarget(text: string):
  | {
      readonly evidence: readonly PrimitiveEvidence[];
      readonly selectionConstraints: NonNullable<
        Extract<
          Effect,
          { type: "selectTargets" }
        >["request"]["selectionConstraints"]
      >;
      readonly target: NonNullable<ReturnType<typeof parseOpponentFieldTarget>>;
    }
  | undefined {
  const match =
    /^(?<target>of your opponent's .+?) with a total (?<stat>power|base power|cost|base cost) of (?<value>[1-9]\d*) (?<comparison>or less|or more)\.?$/iu.exec(
      text,
    );
  const targetText = match?.groups?.["target"];
  const statText = match?.groups?.["stat"];
  const valueText = match?.groups?.["value"];
  const comparisonText = match?.groups?.["comparison"];
  if (
    targetText === undefined ||
    statText === undefined ||
    valueText === undefined ||
    comparisonText === undefined
  ) {
    return undefined;
  }

  const target = parseOpponentFieldTarget({ text: targetText });
  if (target === undefined || target.rest.length > 0) {
    return undefined;
  }

  const stat = parseTotalStatText(statText);
  if (stat === undefined) {
    return undefined;
  }

  const op = comparisonText.toLowerCase() === "or less" ? "lte" : "gte";
  return {
    target,
    selectionConstraints: [
      {
        type: "totalStat",
        stat,
        op,
        value: Number.parseInt(valueText, 10),
      },
    ],
    evidence: [
      "targetConstraint:totalStat",
      totalStatEvidence(stat),
      op === "lte" ? "condition:comparator:lte" : "condition:comparator:gte",
      "condition:threshold:positiveInteger",
    ],
  };
}

function totalStatEvidence(
  stat: "baseCost" | "basePower" | "cost" | "currentPower",
): PrimitiveEvidence {
  if (stat === "currentPower") return "condition:stat:currentPower";
  if (stat === "basePower") return "condition:stat:basePower";
  if (stat === "baseCost") return "condition:stat:baseCost";
  return "condition:stat:cost";
}

function parseTotalStatText(
  text: string,
): "baseCost" | "basePower" | "cost" | "currentPower" | undefined {
  const normalized = text.toLowerCase();
  if (normalized === "power") return "currentPower";
  if (normalized === "base power") return "basePower";
  if (normalized === "cost") return "cost";
  if (normalized === "base cost") return "baseCost";
  return undefined;
}

function parseKoOrRest(actionRest: string): ReturnType<InstructionParser> {
  const match = /^or rest (?<target>.+)$/iu.exec(actionRest);
  const targetText = match?.groups?.["target"];
  if (targetText === undefined) {
    return undefined;
  }

  const cardinality = parseUpToCardinality({ text: targetText });
  if (cardinality === undefined) {
    return undefined;
  }
  const target = parseOpponentFieldTarget({ text: cardinality.rest });
  if (target === undefined || (target.rest.length > 0 && target.rest !== ".")) {
    return undefined;
  }
  const category = target.filter?.categories?.[0];
  const zone = category === "stage" ? "stageArea" : "characterArea";
  const selectedTarget = selectedKoTarget(zone, koOrRestSelectionId);

  return {
    effect: {
      type: "sequence",
      effects: [
        {
          id: `select:ko-or-rest-target:${koOrRestSelectionId}`,
          connector: "always",
          saveResultAs: koOrRestSelectionId,
          effect: {
            type: "selectTargets",
            request: {
              timing: "onResolution",
              chooser: "self",
              player: "opponent",
              zone,
              min: cardinality.cardinality.min,
              max: cardinality.cardinality.max,
              allowFewerIfUnavailable: true,
              visibility: "public",
              filter: target.filter ?? { categories: ["character"] },
            },
          },
        },
        {
          id: "choose:ko-or-rest-target",
          connector: "then",
          effect: {
            type: "choice",
            chooser: "self",
            min: 1,
            max: 1,
            options: [
              {
                id: "choice:ko",
                label: "K.O. the selected card.",
                effect: {
                  type: "ko",
                  target: selectedTarget,
                },
              },
              {
                id: "choice:rest",
                label: "Rest the selected card.",
                effect: {
                  type: "rest",
                  target: selectedTarget,
                },
              },
            ],
          },
        },
      ],
    },
    evidence: [
      "instruction:ko",
      ...cardinality.evidence,
      "chooser:self:upTo",
      ...target.evidence,
      "instruction:rest",
      "composition:chooseOne",
      "composition:selectThenApply",
    ],
    rest: "",
  };
}

function parseKoOrReturnToOwnerHand(
  actionRest: string,
): ReturnType<InstructionParser> {
  const match =
    /^(?<target>.+?),\s*or return it to the owner's hand\.?$/iu.exec(
      actionRest,
    );
  const targetText = match?.groups?.["target"];
  if (targetText === undefined) {
    return undefined;
  }

  const cardinality = parseUpToCardinality({ text: targetText });
  if (cardinality === undefined) {
    return undefined;
  }
  const target = parseOpponentFieldTarget({ text: cardinality.rest });
  if (target === undefined || (target.rest.length > 0 && target.rest !== ".")) {
    return undefined;
  }
  const category = target.filter?.categories?.[0];
  const zone = category === "stage" ? "stageArea" : "characterArea";
  const selectedTarget = selectedKoTarget(zone, koOrReturnSelectionId);

  return {
    effect: {
      type: "sequence",
      effects: [
        {
          id: `select:ko-or-return-target:${koOrReturnSelectionId}`,
          connector: "always",
          saveResultAs: koOrReturnSelectionId,
          effect: {
            type: "selectTargets",
            request: {
              timing: "onResolution",
              chooser: "self",
              player: "opponent",
              zone,
              min: cardinality.cardinality.min,
              max: cardinality.cardinality.max,
              allowFewerIfUnavailable: true,
              visibility: "public",
              filter: target.filter ?? { categories: ["character"] },
            },
          },
        },
        {
          id: "choose:ko-or-return-target",
          connector: "then",
          effect: {
            type: "choice",
            chooser: "self",
            min: 1,
            max: 1,
            options: [
              {
                id: "choice:ko",
                label: "K.O. the selected card.",
                effect: {
                  type: "ko",
                  target: selectedTarget,
                },
              },
              {
                id: "choice:return-to-owner-hand",
                label: "Return the selected card to the owner's hand.",
                effect: {
                  type: "bounce",
                  destination: "hand",
                  target: selectedTarget,
                },
              },
            ],
          },
        },
      ],
    },
    evidence: [
      "instruction:ko",
      ...cardinality.evidence,
      "chooser:self:upTo",
      ...target.evidence,
      "instruction:returnToOwnerHand",
      "destination:ownerHand",
      "composition:chooseOne",
      "composition:selectThenApply",
    ],
    rest: "",
  };
}

function parseComposedKoTargets(
  actionRest: string,
): ReturnType<InstructionParser> {
  const parts = actionRest
    .split(/\s+and\s+(?=up to\b)/iu)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length < 2) {
    return undefined;
  }

  const parsedParts = parts.map((part, index) =>
    parseKoTargetPart(part, `${koTargetSelectionId}:${String(index)}`),
  );
  if (parsedParts.some((part) => part === undefined)) {
    return undefined;
  }

  const definedParts = parsedParts.filter(
    (part): part is NonNullable<(typeof parsedParts)[number]> =>
      part !== undefined,
  );

  return {
    effect: {
      type: "sequence",
      effects: definedParts.map((part, index) => ({
        connector: index === 0 ? "always" : "then",
        effect: part.effect,
      })),
    },
    evidence: [
      "instruction:ko",
      ...definedParts.flatMap((part) => part.evidence),
    ],
    rest: "",
  };
}

function parseKoTargetPart(
  text: string,
  selectionId: string,
):
  | {
      readonly effect: Effect;
      readonly evidence: readonly PrimitiveEvidence[];
    }
  | undefined {
  const cardinality = parseUpToCardinality({ text });
  if (cardinality === undefined) {
    return undefined;
  }
  const target = parseOpponentFieldTarget({ text: cardinality.rest });
  if (target === undefined || (target.rest.length > 0 && target.rest !== ".")) {
    return undefined;
  }
  const category = target.filter?.categories?.[0];
  const zone = category === "stage" ? "stageArea" : "characterArea";
  return {
    effect: selectThenApplyKoEffect({
      min: cardinality.cardinality.min,
      max: cardinality.cardinality.max,
      filter: target.filter ?? { categories: ["character"] },
      zone,
      selectionId,
    }),
    evidence: [
      ...cardinality.evidence,
      "chooser:self:upTo",
      ...target.evidence,
      "composition:selectThenApply",
    ],
  };
}

function selectThenApplyKoEffect(options: {
  readonly min: number;
  readonly max: number;
  readonly filter: TargetFilter;
  readonly selectionConstraints?: Extract<
    Effect,
    { type: "selectTargets" }
  >["request"]["selectionConstraints"];
  readonly zone: "characterArea" | "stageArea";
  readonly selectionId: string;
}): Effect {
  return {
    type: "sequence",
    effects: [
      {
        id: `select:ko-target:${options.selectionId}`,
        connector: "always",
        saveResultAs: options.selectionId,
        effect: {
          type: "selectTargets",
          request: {
            timing: "onResolution",
            chooser: "self",
            player: "opponent",
            zone: options.zone,
            min: options.min,
            max: options.max,
            allowFewerIfUnavailable: true,
            visibility: "public",
            filter: options.filter,
            ...(options.selectionConstraints === undefined
              ? {}
              : { selectionConstraints: options.selectionConstraints }),
          },
        },
      },
      {
        connector: "then",
        effect: {
          type: "ko",
          target: selectedKoTarget(options.zone, options.selectionId),
        },
      },
    ],
  };
}

function selectedKoTarget(
  zone: "characterArea" | "stageArea",
  selectionId: string,
): Target {
  return {
    type: "savedFieldObject",
    binding: {
      family: "selectedTargets",
      saveResultAs: selectionId,
    },
    zone,
    player: "opponent",
    visibility: "publicOnly",
    onFailure: "failClosed",
  };
}

type TargetFilter = NonNullable<
  Extract<Target, { type: "choose" }>["request"]["filter"]
>;
