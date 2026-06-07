import type { CardCategory, Duration, Zone } from "@optcg/types";

import { parseUpToCardinality } from "../../cardinality/index.js";
import { parseThisTurnDuration } from "../../durations/index.js";
import { parsePositivePowerModifier } from "../../modifiers/index.js";
import { sourceSpan } from "../../source-slices.js";
import type { ExpressionParseResult, ParseInput } from "../../types.js";
import {
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
