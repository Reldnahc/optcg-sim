import type { CardCategory, Duration, Zone } from "@optcg/types";

import { parseUpToCardinality } from "../../cardinality/index.js";
import {
  parseDurationFromSet,
  thisTurnOnlyDurationParsers,
} from "../../durations/index.js";
import { parseCardFilterPredicates } from "../../filters/index.js";
import { parsePositivePowerModifier } from "../../modifiers/index.js";
import { sourceSpan } from "../../source-slices.js";
import { parseOpponentCharactersTarget } from "../../targets/index.js";
import type {
  InstructionParseResult,
  ExpressionParseResult,
  InstructionParser,
  ParseInput,
} from "../../types.js";
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
              type: "preventBlockerActivation",
              target: thatCharacterSavedTarget,
              duration: duration.duration,
            },
          },
        ],
      },
      evidence: [
        "instruction:preventBlockerActivation",
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
            type: "preventBlockerActivation",
            target: thatCharacterSavedTarget,
            duration: duration.duration,
          },
        },
      ],
    },
    evidence: [
      "instruction:preventBlockerActivation",
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
  const targetMatch =
    /^of your \{(?<type>[^}]+)\} type Leader or Character cards?\s*$/iu.exec(
      cardinality.rest,
    );
  const typeName = targetMatch?.groups?.["type"]?.trim();
  if (typeName === undefined || typeName.length === 0) {
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
