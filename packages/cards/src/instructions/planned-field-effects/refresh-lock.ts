import type {
  CardCategory,
  CardFilter,
  PlayerRef,
  Target,
  TargetPlayerRef,
  Zone,
} from "@optcg/types";

import { parseUpToCardinality } from "../../cardinality/index.js";
import { parseCardFilterPredicates } from "../../filters/index.js";
import {
  attackRestrictionDurationParsers,
  type DurationParseResult,
  parseDurationFromSet,
  refreshRestrictionDurationParsers,
} from "../../durations/index.js";
import { parseThatCharacterReference } from "../../references/index.js";
import {
  parseAllFieldTarget,
  parseOpponentCharactersTarget,
} from "../../targets/index.js";
import type { InstructionParser, PrimitiveEvidence } from "../../types.js";
import { buildProtectionEffectWithTarget } from "../protection/builders.js";
import { thatCharacterSavedTarget } from "./shared.js";

export const preventThatCharacterRefreshPrimitive = {
  primitiveId: "instruction:preventActivation",
  childPrimitiveIds: [
    "reference:thatCharacter",
    "duration:opponentNextRefreshPhase",
    "duration:thisTurn",
  ],
} as const;

export const preventOpponentCharactersRefreshPrimitive = {
  primitiveId: "instruction:preventActivation",
  childPrimitiveIds: [
    "cardinality:all",
    "cardinality:upTo",
    "target:opponentCharacters",
    "target:opponentRestedCards",
    "duration:opponentNextRefreshPhase",
    "duration:thisTurn",
  ],
} as const;

export const preventOpponentCharactersRestPrimitive = {
  primitiveId: "instruction:giveProtection",
  childPrimitiveIds: [
    "cardinality:upTo",
    "target:opponentCharacters",
    "protectionProcess:rest",
    "duration:opponentNextEndPhase",
    "duration:thisTurn",
  ],
} as const;

export const parsePreventThatCharacterRefreshInstruction: InstructionParser = (
  input,
) => {
  const reference = parseThatCharacterReference(input);
  if (reference === undefined) {
    return undefined;
  }

  const durationText = /^will not become active\s+(?<rest>.*)$/i.exec(
    reference.rest,
  )?.groups?.["rest"];
  if (durationText === undefined) {
    return undefined;
  }

  const duration = parseRefreshRestrictionDurationForTarget(
    durationText,
    thatCharacterSavedTarget,
  );
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

export const parsePreventThisCharacterRefreshInstruction: InstructionParser = (
  input,
) => {
  const durationText =
    /^this Character will not become active\s+(?<rest>.*)$/iu.exec(input.text)
      ?.groups?.["rest"];
  if (durationText === undefined) {
    return undefined;
  }

  const target: Target = { type: "self" };
  const duration = parseRefreshRestrictionDurationForTarget(
    durationText,
    target,
  );
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
      target,
      duration: duration.duration,
    },
    evidence: [
      "instruction:preventActivation",
      "target:thisCharacter",
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

    const durationText = /^will not become active\s+(?<rest>.*)$/i.exec(
      parsedTarget.rest,
    )?.groups?.["rest"];
    if (durationText === undefined) {
      return undefined;
    }

    const duration = parseRefreshRestrictionDurationForTarget(
      durationText,
      parsedTarget.target,
    );
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

export const parsePreventOpponentCharactersRestInstruction: InstructionParser =
  (input) => {
    const parsedTarget = parseOpponentRefreshLockTarget(input.text);
    if (parsedTarget === undefined) {
      return undefined;
    }

    const durationText = /^cannot be rested\s+(?<rest>.*)$/i.exec(
      parsedTarget.rest,
    )?.groups?.["rest"];
    if (durationText === undefined) {
      return undefined;
    }

    const duration = parseDurationFromSet(
      { text: durationText },
      attackRestrictionDurationParsers,
    );
    if (
      duration === undefined ||
      duration.duration === undefined ||
      duration.rest.length > 0
    ) {
      return undefined;
    }

    return {
      effect: buildProtectionEffectWithTarget({
        duration: duration.duration,
        process: "rest",
        sourceCardCategories: undefined,
        sourceCardFilter: undefined,
        sourceKind: "cardEffect",
        sourceControllerRelation: "opponentControlled",
        target: parsedTarget.target,
      }),
      evidence: [
        "instruction:giveProtection",
        ...parsedTarget.evidence,
        "protectionProcess:rest",
        ...duration.evidence,
      ],
      rest: "",
    };
  };

const parseOpponentRefreshLockTarget = (
  text: string,
): RefreshLockTargetParseResult | undefined => {
  const cardinality = parseUpToCardinality({ text });
  if (cardinality !== undefined) {
    const restedDon = parseOpponentRestedDonRefreshLockTarget(
      cardinality.rest,
      cardinality.cardinality.min,
      cardinality.cardinality.max,
    );
    if (restedDon !== undefined) {
      return {
        target: restedDon.target,
        evidence: [
          ...cardinality.evidence,
          "chooser:self:upTo",
          ...restedDon.evidence,
        ],
        rest: restedDon.rest,
      };
    }
    const restedCharactersOrDon =
      parseOpponentRestedCharactersOrDonRefreshLockTarget(
        cardinality.rest,
        cardinality.cardinality.min,
        cardinality.cardinality.max,
      );
    if (restedCharactersOrDon !== undefined) {
      return {
        target: restedCharactersOrDon.target,
        evidence: [
          ...cardinality.evidence,
          "chooser:self:upTo",
          ...restedCharactersOrDon.evidence,
        ],
        rest: restedCharactersOrDon.rest,
      };
    }
    const restedLeadersAndCharacters =
      parseOpponentRestedLeadersAndCharactersRefreshLockTarget(
        cardinality.rest,
        cardinality.cardinality.min,
        cardinality.cardinality.max,
      );
    if (restedLeadersAndCharacters !== undefined) {
      return {
        target: restedLeadersAndCharacters.target,
        evidence: [
          ...cardinality.evidence,
          "chooser:self:upTo",
          ...restedLeadersAndCharacters.evidence,
        ],
        rest: restedLeadersAndCharacters.rest,
      };
    }
    const restedCards = parseOpponentRestedCardsRefreshLockTarget(
      cardinality.rest,
      cardinality.cardinality.min,
      cardinality.cardinality.max,
    );
    if (restedCards !== undefined) {
      return {
        target: restedCards.target,
        evidence: [
          ...cardinality.evidence,
          "chooser:self:upTo",
          ...restedCards.evidence,
        ],
        rest: restedCards.rest,
      };
    }
    const restedCharactersOrStages =
      parseOpponentRestedCharactersOrStagesRefreshLockTarget(
        cardinality.rest,
        cardinality.cardinality.min,
        cardinality.cardinality.max,
      );
    if (restedCharactersOrStages !== undefined) {
      return {
        target: restedCharactersOrStages.target,
        evidence: [
          ...cardinality.evidence,
          "chooser:self:upTo",
          ...restedCharactersOrStages.evidence,
        ],
        rest: restedCharactersOrStages.rest,
      };
    }
    const anyRestedCharacter = parseAnyRestedCharacterRefreshLockTarget(
      cardinality.rest,
      cardinality.cardinality.min,
      cardinality.cardinality.max,
    );
    if (anyRestedCharacter !== undefined) {
      return {
        target: anyRestedCharacter.target,
        evidence: [
          ...cardinality.evidence,
          "chooser:self:upTo",
          ...anyRestedCharacter.evidence,
        ],
        rest: anyRestedCharacter.rest,
      };
    }
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

function parseRefreshRestrictionDurationForTarget(
  text: string,
  target: Target,
): DurationParseResult | undefined {
  const explicit = parseDurationFromSet(
    { text },
    refreshRestrictionDurationParsers,
  );
  if (explicit !== undefined) {
    return explicit;
  }

  if (!/^in the next Refresh Phase\.?$/iu.test(text)) {
    return undefined;
  }

  const player = concreteTargetPlayer(target);
  if (player === undefined) {
    return undefined;
  }

  return {
    duration: { type: "untilStartOfNextTurn", player },
    evidence: [
      player === "opponent"
        ? "duration:opponentNextRefreshPhase"
        : "duration:selfNextRefreshPhase",
    ],
    rest: "",
  };
}

function concreteTargetPlayer(target: Target): PlayerRef | undefined {
  switch (target.type) {
    case "all":
      return concretePlayerRef(target.player);
    case "choose":
      return concretePlayerRef(target.request.player);
    case "chooseFromZones":
      return concretePlayerRef(target.request.player);
    case "savedFieldObject":
      return concretePlayerRef(target.player);
    case "myLeader":
    case "self":
      return "self";
    case "opponentLeader":
      return "opponent";
    case "affectedCard":
    case "attacker":
    case "attackTarget":
    case "blocker":
    case "player":
    case "replacementTarget":
    case "savedSelectedCard":
    case "triggerCard":
      return undefined;
  }
}

function concretePlayerRef(
  player: TargetPlayerRef | undefined,
): PlayerRef | undefined {
  return player === "self" || player === "opponent" ? player : undefined;
}

const parseOpponentRestedDonRefreshLockTarget = (
  text: string,
  min: number,
  max: number,
): RefreshLockTargetParseResult | undefined =>
  parseOpponentRestedChooseFromZonesRefreshLockTarget(text, min, max, {
    pattern: /^of your opponent's rested DON!! cards?\b\s*(?<rest>.*)$/iu,
    zones: ["costArea"],
    categories: ["don"],
    evidence: [
      "target:opponentRestedCards",
      "player:opponent",
      "zone:costArea",
      "filter:category:don",
      "filter:state:rested",
    ],
  });

const parseOpponentRestedCharactersOrStagesRefreshLockTarget = (
  text: string,
  min: number,
  max: number,
): RefreshLockTargetParseResult | undefined =>
  parseOpponentRestedChooseFromZonesRefreshLockTarget(text, min, max, {
    pattern:
      /^of your opponent's rested Characters or Stages\b\s*(?<rest>.*)$/iu,
    zones: ["characterArea", "stageArea"],
    categories: ["character", "stage"],
    evidence: [
      "target:opponentRestedCards",
      "player:opponent",
      "zone:characterArea",
      "zone:stageArea",
      "filter:category:character",
      "filter:category:stage",
      "filter:state:rested",
    ],
  });

const parseOpponentRestedCharactersOrDonRefreshLockTarget = (
  text: string,
  min: number,
  max: number,
): RefreshLockTargetParseResult | undefined =>
  parseOpponentRestedChooseFromZonesRefreshLockTarget(text, min, max, {
    pattern:
      /^of your opponent's rested Characters? or DON!! cards?\b\s*(?<rest>.*)$/iu,
    zones: ["characterArea", "costArea"],
    categories: ["character", "don"],
    evidence: [
      "target:opponentRestedCards",
      "player:opponent",
      "zone:characterArea",
      "zone:costArea",
      "filter:category:character",
      "filter:category:don",
      "filter:state:rested",
    ],
  });

const parseOpponentRestedLeadersAndCharactersRefreshLockTarget = (
  text: string,
  min: number,
  max: number,
): RefreshLockTargetParseResult | undefined =>
  parseOpponentRestedChooseFromZonesRefreshLockTarget(text, min, max, {
    pattern:
      /^of your opponent's rested Leaders? and Characters? cards?\b\s*(?<rest>.*)$/iu,
    zones: ["leaderArea", "characterArea"],
    categories: ["leader", "character"],
    evidence: [
      "target:opponentRestedCards",
      "player:opponent",
      "zone:leaderArea",
      "zone:characterArea",
      "filter:category:leader",
      "filter:category:character",
      "filter:state:rested",
    ],
  });

const parseAnyRestedCharacterRefreshLockTarget = (
  text: string,
  min: number,
  max: number,
):
  | {
      readonly evidence: readonly PrimitiveEvidence[];
      readonly rest: string;
      readonly target: Target;
    }
  | undefined => {
  const predicates = parseCardFilterPredicates(
    { text },
    { powerSemantics: "current" },
  );
  if (
    predicates === undefined ||
    predicates.filter.categories?.[0] !== "character" ||
    predicates.filter.state !== "rested"
  ) {
    return undefined;
  }
  return {
    target: {
      type: "choose",
      request: {
        timing: "onResolution",
        chooser: "self",
        player: "anyPlayer",
        zone: "characterArea",
        filter: predicates.filter,
        min,
        max,
        allowFewerIfUnavailable: true,
        visibility: "public",
      },
    },
    evidence: ["player:any", "target:anyCharacters", ...predicates.evidence],
    rest: predicates.rest.trim(),
  };
};

const parseOpponentRestedCardsRefreshLockTarget = (
  text: string,
  min: number,
  max: number,
): RefreshLockTargetParseResult | undefined =>
  parseOpponentRestedChooseFromZonesRefreshLockTarget(text, min, max, {
    pattern: /^of your opponent's rested cards?\b\s*(?<rest>.*)$/iu,
    zones: ["leaderArea", "characterArea", "stageArea", "costArea"],
    categories: ["leader", "character", "stage", "don"],
    evidence: [
      "target:opponentRestedCards",
      "player:opponent",
      "zone:leaderArea",
      "zone:characterArea",
      "zone:stageArea",
      "zone:costArea",
      "filter:category:leader",
      "filter:category:character",
      "filter:category:stage",
      "filter:category:don",
      "filter:state:rested",
    ],
  });

interface RefreshLockTargetParseResult {
  readonly evidence: readonly PrimitiveEvidence[];
  readonly rest: string;
  readonly target: Target;
}

function parseOpponentRestedChooseFromZonesRefreshLockTarget(
  text: string,
  min: number,
  max: number,
  options: {
    readonly pattern: RegExp;
    readonly zones: readonly Zone[];
    readonly categories: readonly CardCategory[];
    readonly evidence: readonly PrimitiveEvidence[];
  },
): RefreshLockTargetParseResult | undefined {
  const match = options.pattern.exec(text);
  if (match === null) {
    return undefined;
  }

  return {
    target: {
      type: "chooseFromZones",
      request: {
        timing: "onResolution",
        chooser: "self",
        player: "opponent",
        zones: [...options.zones],
        filter: {
          categories: [...options.categories],
          state: "rested",
        },
        min,
        max,
        allowFewerIfUnavailable: true,
        visibility: "public",
      },
    },
    evidence: options.evidence,
    rest: match.groups?.["rest"]?.trim() ?? "",
  };
}
