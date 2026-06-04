import type {
  CardCategory,
  CardFilter,
  Duration,
  Target,
  Zone,
} from "@optcg/types";

import { parseUpToCardinality } from "../cardinality/index.js";
import {
  parseOpponentNextEndPhaseDuration,
  parseOpponentNextRefreshPhaseDuration,
  parseThisTurnDuration,
} from "../durations/index.js";
import { parsePositivePowerModifier } from "../modifiers/index.js";
import { parseThatCharacterReference } from "../references/index.js";
import {
  parseAllFieldTarget,
  parseOpponentCharactersOrDonCardsTarget,
  parseOpponentCharactersTarget,
  parseOpponentLeaderOrCharacterCardsTarget,
  parseYourLeaderTarget,
} from "../targets/index.js";
import type {
  ExpressionParseResult,
  InstructionParser,
  PrimitiveEvidence,
} from "../types.js";

const thatCharacterSelectionId = "selected:thatCharacter";
const selectedBlockerRestrictedAttackerId =
  "selected:blocker-restricted-attacker";

const thatCharacterSavedTarget = {
  type: "savedFieldObject",
  binding: {
    family: "selectedTargets",
    saveResultAs: thatCharacterSelectionId,
  },
  zone: "characterArea",
  player: "opponent",
  visibility: "publicOnly",
  onFailure: "failClosed",
} as const;

const selectedBlockerRestrictedLeaderTarget = {
  type: "savedFieldObject",
  binding: {
    family: "selectedTargets",
    saveResultAs: selectedBlockerRestrictedAttackerId,
  },
  zone: "leaderArea",
  player: "self",
  visibility: "publicOnly",
  onFailure: "failClosed",
} as const;

const selectedBlockerRestrictedCharacterTarget = {
  type: "savedFieldObject",
  binding: {
    family: "selectedTargets",
    saveResultAs: selectedBlockerRestrictedAttackerId,
  },
  zone: "characterArea",
  player: "self",
  visibility: "publicOnly",
  onFailure: "failClosed",
} as const;

type SelectedBlockerRestrictedTarget =
  | typeof selectedBlockerRestrictedLeaderTarget
  | typeof selectedBlockerRestrictedCharacterTarget;

export const restOpponentCharactersPrimitive = {
  primitiveId: "instruction:rest",
  childPrimitiveIds: ["cardinality:upTo", "target:opponentCharacters"],
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

export const preventThatCharacterRefreshPrimitive = {
  primitiveId: "instruction:preventActivation",
  childPrimitiveIds: [
    "reference:thatCharacter",
    "duration:opponentNextRefreshPhase",
  ],
} as const;

export const preventOpponentCharactersRefreshPrimitive = {
  primitiveId: "instruction:preventActivation",
  childPrimitiveIds: [
    "cardinality:all",
    "cardinality:upTo",
    "target:opponentCharacters",
    "duration:opponentNextRefreshPhase",
  ],
} as const;

export const yourLeaderPowerOpponentNextEndPrimitive = {
  primitiveId: "instruction:modifyPower",
  childPrimitiveIds: [
    "target:yourLeader",
    "modifier:positivePower",
    "duration:opponentNextEndPhase",
  ],
} as const;

export const preventSelectedAttackerBlockerActivationPrimitive = {
  primitiveId: "instruction:preventBlockerActivation",
  childPrimitiveIds: [
    "reference:thatCharacter",
    "duration:thisTurn",
    "activation:blocker",
  ],
} as const;

export const selectPowerThenPreventBlockerActivationExpressionParser = (input: {
  readonly text: string;
}): ExpressionParseResult | undefined => {
  const match =
    /^Select\s+(?<selection>up to [^.]+?)\s+and that card\s+(?<power>gains .+?)\.\s+Then,\s+if the selected card attacks during this turn,\s+your opponent cannot activate \[Blocker\]\.?$/iu.exec(
      input.text,
    );
  const selectionText = match?.groups?.["selection"];
  const powerText = match?.groups?.["power"];
  if (selectionText === undefined || powerText === undefined) {
    return undefined;
  }

  const cardinality = parseUpToCardinality({ text: selectionText });
  if (cardinality === undefined) {
    return undefined;
  }
  const targetMatch =
    /^of your \{(?<type>[^}]+)\} type Leader or Character cards?\s*$/iu.exec(
      cardinality.rest,
    );
  const typeName = targetMatch?.groups?.["type"]?.trim();
  if (typeName === undefined || typeName.length === 0) {
    return undefined;
  }

  const modifierMatch = /^gains\s+(?<rest>.*)$/iu.exec(powerText);
  const modifierText = modifierMatch?.groups?.["rest"];
  if (modifierText === undefined) {
    return undefined;
  }
  const modifier = parsePositivePowerModifier({ text: modifierText });
  if (modifier === undefined) {
    return undefined;
  }
  const duration = parseThisTurnDuration({ text: modifier.rest });
  if (
    duration === undefined ||
    duration.duration === undefined ||
    duration.rest.length > 0
  ) {
    return undefined;
  }
  const parsedDuration: Duration = duration.duration;
  const targetZones: Zone[] = ["leaderArea", "characterArea"];
  const targetCategories: CardCategory[] = ["leader", "character"];

  const selectSegment = {
    id: "select:blocker-restricted-attacker",
    connector: "always" as const,
    saveResultAs: selectedBlockerRestrictedAttackerId,
    effect: {
      type: "selectTargets" as const,
      request: {
        timing: "onResolution" as const,
        chooser: "self" as const,
        player: "self" as const,
        zones: targetZones,
        min: cardinality.cardinality.min,
        max: cardinality.cardinality.max,
        allowFewerIfUnavailable: true,
        visibility: "public" as const,
        filter: {
          categories: targetCategories,
          typesAny: [typeName],
        },
      },
    },
  };

  const powerEffect = (target: SelectedBlockerRestrictedTarget) => ({
    type: "modifyPower" as const,
    target,
    value: modifier.value,
    duration: parsedDuration,
  });
  const preventBlockerEffect = (target: SelectedBlockerRestrictedTarget) => ({
    type: "preventBlockerActivation" as const,
    target,
    duration: parsedDuration,
  });

  return {
    effect: {
      type: "sequence",
      effects: [
        selectSegment,
        {
          id: "selected-leader:power",
          connector: "then",
          effect: powerEffect(selectedBlockerRestrictedLeaderTarget),
        },
        {
          id: "selected-character:power",
          connector: "then",
          effect: powerEffect(selectedBlockerRestrictedCharacterTarget),
        },
        {
          id: "selected-leader:prevent-blocker",
          connector: "then",
          effect: preventBlockerEffect(selectedBlockerRestrictedLeaderTarget),
        },
        {
          id: "selected-character:prevent-blocker",
          connector: "then",
          effect: preventBlockerEffect(
            selectedBlockerRestrictedCharacterTarget,
          ),
        },
      ],
    },
    evidence: [
      "composition:selectThenApply",
      ...cardinality.evidence,
      "chooser:self:upTo",
      "target:yourLeaderOrCharacters",
      "player:self",
      "filter:type",
      "filter:category:leader",
      "filter:category:character",
      "instruction:modifyPower",
      ...modifier.evidence,
      ...duration.evidence,
      "instruction:preventBlockerActivation",
      "activation:blocker",
    ],
    rest: "",
  };
};

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

export const parseRestOpponentCharactersOrDonCardsInstruction: InstructionParser =
  (input) => {
    const actionMatch = /^Rest\s+(?<rest>.*)$/i.exec(input.text);
    const actionRest = actionMatch?.groups?.["rest"];
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

export const parseRestOpponentLeaderOrCharactersInstruction: InstructionParser =
  (input) => {
    const actionMatch = /^Rest\s+(?<rest>.*)$/i.exec(input.text);
    const actionRest = actionMatch?.groups?.["rest"];
    if (actionRest === undefined) {
      return undefined;
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

export const parsePreventThatCharacterRefreshInstruction: InstructionParser = (
  input,
) => {
  const reference = parseThatCharacterReference(input);
  if (reference === undefined) {
    return undefined;
  }

  const actionMatch = /^will not become active\s+(?<rest>.*)$/i.exec(
    reference.rest,
  );
  const durationText = actionMatch?.groups?.["rest"];
  if (durationText === undefined) {
    return undefined;
  }

  const duration = parseOpponentNextRefreshPhaseDuration({
    text: durationText,
  });
  if (
    duration === undefined ||
    duration.duration === undefined ||
    duration.rest.length > 0
  ) {
    return undefined;
  }

  return {
    effect: {
      type: "cannotBecomeActive",
      target: thatCharacterSavedTarget,
      duration: duration.duration,
    },
    evidence: [
      "instruction:preventActivation",
      ...reference.evidence,
      ...duration.evidence,
    ],
    rest: "",
  };
};

export const parsePreventOpponentCharactersRefreshInstruction: InstructionParser =
  (input) => {
    const parsedTarget = parseOpponentRefreshLockTarget(input.text);
    if (parsedTarget === undefined) {
      return undefined;
    }

    const actionMatch = /^will not become active\s+(?<rest>.*)$/i.exec(
      parsedTarget.rest,
    );
    const durationText = actionMatch?.groups?.["rest"];
    if (durationText === undefined) {
      return undefined;
    }

    const duration = parseOpponentNextRefreshPhaseDuration({
      text: durationText,
    });
    if (
      duration === undefined ||
      duration.duration === undefined ||
      duration.rest.length > 0
    ) {
      return undefined;
    }

    return {
      effect: {
        type: "cannotBecomeActive",
        target: parsedTarget.target,
        duration: duration.duration,
      },
      evidence: [
        "instruction:preventActivation",
        ...parsedTarget.evidence,
        ...duration.evidence,
      ],
      rest: "",
    };
  };

const parseOpponentRefreshLockTarget = (
  text: string,
):
  | {
      readonly target: Target;
      readonly evidence: readonly PrimitiveEvidence[];
      readonly rest: string;
    }
  | undefined => {
  const cardinality = parseUpToCardinality({ text });
  if (cardinality !== undefined) {
    const target = parseOpponentCharactersTarget({ text: cardinality.rest });
    if (target === undefined) {
      return undefined;
    }
    const filter: CardFilter = target.filter ?? { categories: ["character"] };
    return {
      target: {
        type: "choose",
        request: {
          timing: "onResolution",
          chooser: "self",
          player: "opponent",
          zone: "characterArea",
          filter,
          min: cardinality.cardinality.min,
          max: cardinality.cardinality.max,
          allowFewerIfUnavailable: true,
          visibility: "public",
        },
      },
      evidence: [
        ...cardinality.evidence,
        "chooser:self:upTo",
        ...target.evidence,
      ],
      rest: target.rest,
    };
  }

  const allTarget = parseAllFieldTarget({ text });
  if (
    allTarget === undefined ||
    allTarget.target.type !== "all" ||
    allTarget.target.player !== "opponent" ||
    allTarget.target.zone !== "characterArea" ||
    allTarget.target.filter?.categories?.[0] !== "character"
  ) {
    return undefined;
  }
  return {
    target: {
      type: "all",
      player: "opponent",
      zone: "characterArea",
      filter: allTarget.target.filter ?? { categories: ["character"] },
    },
    evidence: [
      "cardinality:all",
      "player:opponent",
      "target:opponentCharacters",
      ...allTarget.evidence.filter(
        (evidence) =>
          evidence !== "cardinality:all" &&
          evidence !== "player:opponent" &&
          evidence !== "zone:characterArea",
      ),
    ],
    rest: allTarget.rest.trim(),
  };
};

export const parseYourLeaderPowerOpponentNextEndInstruction: InstructionParser =
  (input) => {
    const target = parseYourLeaderTarget(input);
    if (target === undefined || target.target === undefined) {
      return undefined;
    }

    const actionMatch = /^gains\s+(?<rest>.*)$/i.exec(target.rest);
    const modifierText = actionMatch?.groups?.["rest"];
    if (modifierText === undefined) {
      return undefined;
    }

    const modifier = parsePositivePowerModifier({ text: modifierText });
    if (modifier === undefined) {
      return undefined;
    }

    const duration = parseOpponentNextEndPhaseDuration({
      text: modifier.rest,
    });
    if (
      duration === undefined ||
      duration.duration === undefined ||
      duration.rest.length > 0
    ) {
      return undefined;
    }

    return {
      effect: {
        type: "modifyPower",
        target: target.target,
        value: modifier.value,
        duration: duration.duration,
      },
      evidence: [
        "instruction:modifyPower",
        ...target.evidence,
        ...modifier.evidence,
        ...duration.evidence,
      ],
      rest: "",
    };
  };
