import type {
  Duration,
  SavedFieldObjectZone,
  SelectTargetsEffect,
  Target,
  Zone,
} from "@optcg/types";

import {
  parseAllCardinality,
  parseUpToCardinality,
} from "../../cardinality/index.js";
import {
  battleDurationParsers,
  parseDurationFromSet,
  thisTurnOnlyDurationParsers,
} from "../../durations/index.js";
import { parseCardFilterPredicates } from "../../filters/index.js";
import { parsePositivePowerModifier } from "../../modifiers/index.js";
import { sourceSpan } from "../../source-slices.js";
import {
  parseOpponentCharactersTarget,
  parseTargetFromSet,
  selectedPowerGainTargetParsers,
} from "../../targets/index.js";
import type {
  InstructionParseResult,
  ExpressionParseResult,
  InstructionParser,
  ParseInput,
} from "../../types.js";
import { withCardinality } from "../modify-power/shared.js";
import {
  thatCharacterSavedTarget,
  thatCharacterSelectionId,
  selectedBlockerRestrictedAttackerId,
  selectedBlockerRestrictedTarget,
} from "./shared.js";

export const preventSelectedAttackerBlockerActivationPrimitive = {
  primitiveId: "instruction:preventBlockerActivation",
  childPrimitiveIds: [
    "reference:thatCharacter",
    "duration:thisTurn",
    "activation:blocker",
  ],
} as const;

export const parsePreventOpponentCharactersBlockerActivationInstruction: InstructionParser =
  (input) => {
    const opponentCannotActivate = parseOpponentCannotActivateBlocker(input);
    if (opponentCannotActivate !== undefined) {
      return opponentCannotActivate;
    }

    const all = parseAllCardinality({ text: input.text });
    if (all !== undefined) {
      const allRestriction = parseAllOpponentCharactersCannotBlock(
        all.rest,
        all.evidence,
      );
      if (allRestriction !== undefined) {
        return allRestriction;
      }
    }

    const cardinality = parseUpToCardinality({ text: input.text });
    if (cardinality === undefined) {
      return undefined;
    }

    const target = parseOpponentCharactersTarget({ text: cardinality.rest });
    if (target === undefined) {
      return undefined;
    }

    const durationText = /^cannot activate \[Blocker\]\s+(?<rest>.*)$/i.exec(
      target.rest,
    )?.groups?.["rest"];
    if (durationText === undefined) {
      return undefined;
    }

    const duration = parseDurationFromSet(
      { text: durationText },
      thisTurnOnlyDurationParsers,
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
        type: "sequence",
        effects: [
          {
            id: "select:blocker-restricted-character",
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
              type: "cannotBlock",
              target: thatCharacterSavedTarget,
              duration: duration.duration,
            },
          },
        ],
      },
      evidence: [
        "instruction:cannotBlock",
        ...cardinality.evidence,
        "chooser:self:upTo",
        ...target.evidence,
        ...duration.evidence,
        "activation:blocker",
        "composition:selectThenApply",
      ],
      rest: "",
    };
  };

function parseOpponentCannotActivateBlocker(
  input: ParseInput,
): InstructionParseResult | undefined {
  const currentAttackerBattleRestriction =
    parseCurrentAttackerBlockerRestriction(input.text);
  if (currentAttackerBattleRestriction !== undefined) {
    return currentAttackerBattleRestriction;
  }

  const paidCostAttack = parsePaidCostAttackBlockerRestriction(input.text);
  if (paidCostAttack !== undefined) {
    return paidCostAttack;
  }

  const leaderAttack = parseLeaderAttackBlockerRestriction(input.text);
  if (leaderAttack !== undefined) {
    return leaderAttack;
  }

  const selectionText = /^Your opponent cannot activate\s+(?<rest>.+)$/iu.exec(
    input.text,
  )?.groups?.["rest"];
  if (selectionText === undefined) {
    return undefined;
  }

  const cardinality = parseUpToCardinality({ text: selectionText });
  if (cardinality === undefined) {
    return undefined;
  }

  const targetMatch =
    /^\[Blocker\]\s+(?<predicate>.+?)\s+(?<duration>during this turn\.?)$/iu.exec(
      cardinality.rest,
    );
  const predicateText = targetMatch?.groups?.["predicate"]
    ?.replace(/\bthat has\b/iu, "with")
    .trim();
  const durationText = targetMatch?.groups?.["duration"];
  if (predicateText === undefined || durationText === undefined) {
    return undefined;
  }

  const predicates = parseCardFilterPredicates(
    { text: predicateText },
    { powerSemantics: "current" },
  );
  if (predicates === undefined || predicates.rest.trim().length > 0) {
    return undefined;
  }

  const duration = parseDurationFromSet(
    { text: durationText },
    thisTurnOnlyDurationParsers,
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
      type: "sequence",
      effects: [
        {
          id: "select:blocker-restricted-character",
          connector: "always",
          saveResultAs: thatCharacterSelectionId,
          effect: {
            type: "selectTargets",
            request: {
              timing: "onResolution",
              chooser: "self",
              player: "opponent",
              zone: "characterArea",
              filter: predicates.filter,
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
            type: "cannotBlock",
            target: thatCharacterSavedTarget,
            duration: duration.duration,
          },
        },
      ],
    },
    evidence: [
      "instruction:cannotBlock",
      ...cardinality.evidence,
      "chooser:self:upTo",
      "player:opponent",
      "target:opponentCharacters",
      ...predicates.evidence,
      ...duration.evidence,
      "activation:blocker",
      "composition:selectThenApply",
    ],
    rest: "",
  };
}

function parseAllOpponentCharactersCannotBlock(
  text: string,
  cardinalityEvidence: readonly InstructionParseResult["evidence"][number][],
): InstructionParseResult | undefined {
  const target = parseOpponentCharactersTarget({ text });
  if (target === undefined) {
    return undefined;
  }

  const durationText = /^cannot activate \[Blocker\]\s+(?<rest>.*)$/iu.exec(
    target.rest,
  )?.groups?.["rest"];
  if (durationText === undefined) {
    return undefined;
  }

  const duration = parseDurationFromSet(
    { text: durationText },
    thisTurnOnlyDurationParsers,
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
      type: "cannotBlock",
      target: {
        type: "all",
        player: "opponent",
        zone: "characterArea",
        filter: target.filter ?? { categories: ["character"] },
      },
      duration: duration.duration,
    },
    evidence: [
      "instruction:cannotBlock",
      ...cardinalityEvidence,
      ...target.evidence,
      ...duration.evidence,
      "activation:blocker",
    ],
    rest: "",
  };
}

function parseCurrentAttackerBlockerRestriction(
  text: string,
): InstructionParseResult | undefined {
  const durationText =
    /^Your opponent cannot activate \[Blocker\]\s+(?<duration>during this battle\.?)$/iu.exec(
      text,
    )?.groups?.["duration"];
  if (durationText === undefined) {
    return undefined;
  }
  const duration = parseDurationFromSet(
    { text: durationText },
    battleDurationParsers,
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
      type: "preventBlockerActivation",
      target: { type: "attacker" },
      duration: duration.duration,
    },
    evidence: [
      "instruction:preventBlockerActivation",
      "target:attacker",
      ...duration.evidence,
      "activation:blocker",
    ],
    rest: "",
  };
}

function parsePaidCostAttackBlockerRestriction(
  text: string,
): InstructionParseResult | undefined {
  const durationText =
    /^Your opponent cannot activate \[Blocker\] when the card given these DON!! cards attacks\s+(?<duration>during this turn\.?)$/iu.exec(
      text,
    )?.groups?.["duration"];
  if (durationText === undefined) {
    return undefined;
  }
  const duration = parseDurationFromSet(
    { text: durationText },
    thisTurnOnlyDurationParsers,
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
      type: "preventBlockerActivation",
      target: {
        type: "savedFieldObject",
        binding: { family: "paidCost", saveResultAs: "paidCost" },
        zones: ["leaderArea", "characterArea"],
        player: "self",
        visibility: "publicOnly",
        onFailure: "failClosed",
      },
      duration: duration.duration,
    },
    evidence: [
      "instruction:preventBlockerActivation",
      "reference:paidCost",
      ...duration.evidence,
      "activation:blocker",
    ],
    rest: "",
  };
}

function parseLeaderAttackBlockerRestriction(
  text: string,
): InstructionParseResult | undefined {
  const durationText =
    /^your opponent cannot activate \[Blocker\] whenever your Leader attacks\s+(?<duration>during this turn\.?)$/iu.exec(
      text,
    )?.groups?.["duration"];
  if (durationText === undefined) {
    return undefined;
  }
  const duration = parseDurationFromSet(
    { text: durationText },
    thisTurnOnlyDurationParsers,
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
      type: "preventBlockerActivation",
      target: { type: "myLeader" },
      duration: duration.duration,
    },
    evidence: [
      "instruction:preventBlockerActivation",
      "target:yourLeader",
      ...duration.evidence,
      "activation:blocker",
    ],
    rest: "",
  };
}

export const selectPowerThenPreventBlockerActivationExpressionParser = (
  input: ParseInput,
): ExpressionParseResult | undefined => {
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
  const target = parseTargetFromSet(
    { text: cardinality.rest },
    selectedPowerGainTargetParsers(),
  );
  if (target?.target === undefined || target.rest.trim().length > 0) {
    return undefined;
  }

  const modifierText = /^gains\s+(?<rest>.*)$/iu.exec(powerText)?.groups?.[
    "rest"
  ];
  if (modifierText === undefined) {
    return undefined;
  }
  const modifier = parsePositivePowerModifier({ text: modifierText });
  if (modifier === undefined) {
    return undefined;
  }
  const duration = parseDurationFromSet(
    { text: modifier.rest },
    thisTurnOnlyDurationParsers,
  );
  if (
    duration === undefined ||
    duration.duration === undefined ||
    duration.rest.length > 0
  ) {
    return undefined;
  }
  const parsedDuration: Duration = duration.duration;
  const selectionTarget = withCardinality(
    target.target,
    cardinality.cardinality,
  );
  const selectionRequest = publicFieldSelectionRequest(selectionTarget);
  if (selectionRequest === undefined) {
    return undefined;
  }

  const selectSegment = {
    id: "select:blocker-restricted-attacker",
    connector: "always" as const,
    saveResultAs: selectedBlockerRestrictedAttackerId,
    effect: {
      type: "selectTargets" as const,
      request: selectionRequest,
    },
  };

  const powerEffect = {
    type: "modifyPower" as const,
    target: selectedBlockerRestrictedTarget,
    value: modifier.value,
    duration: parsedDuration,
  };
  const preventBlockerEffect = {
    type: "preventBlockerActivation" as const,
    target: selectedBlockerRestrictedTarget,
    duration: parsedDuration,
  };

  const evidence = [
    "composition:selectThenApply",
    ...cardinality.evidence,
    "chooser:self:upTo",
    "player:self",
    ...target.evidence,
    "instruction:modifyPower",
    ...modifier.evidence,
    ...duration.evidence,
    "instruction:preventBlockerActivation",
    "activation:blocker",
  ] as const;
  return {
    effect: {
      type: "sequence",
      effects: [
        selectSegment,
        {
          id: "selected-attacker:power",
          connector: "then",
          effect: powerEffect,
        },
        {
          id: "selected-attacker:prevent-blocker",
          connector: "then",
          effect: preventBlockerEffect,
        },
      ],
    },
    evidence,
    rest: "",
    ...(input.source === undefined
      ? {}
      : {
          presentationSpans: [
            sourceSpan("span:body", "body", input.source, evidence),
          ],
        }),
  };
};

function publicFieldSelectionRequest(
  target: Target,
): SelectTargetsEffect["request"] | undefined {
  if (target.type === "choose") {
    if (
      !isSavedFieldObjectZone(target.request.zone) ||
      target.request.visibility !== "public"
    ) {
      return undefined;
    }
    return {
      ...target.request,
      zone: target.request.zone,
      visibility: "public",
    };
  }

  if (target.type === "chooseFromZones") {
    if (
      target.request.visibility !== "public" ||
      target.request.zones.some((zone) => !isSavedFieldObjectZone(zone))
    ) {
      return undefined;
    }
    return target.request;
  }

  return undefined;
}

function isSavedFieldObjectZone(zone: Zone): zone is SavedFieldObjectZone {
  return (
    zone === "leaderArea" ||
    zone === "characterArea" ||
    zone === "stageArea" ||
    zone === "costArea"
  );
}
