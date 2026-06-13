import type {
  Effect,
  MultiZoneTargetRequest,
  SavedFieldObjectZone,
  SelectedTargetsRequest,
  SelectionId,
  Target,
} from "@optcg/types";

import {
  fieldEffectDurationParsers,
  parseDurationFromSet,
} from "../durations/index.js";
import { parseModifyPowerInstruction } from "../instructions/index.js";
import type {
  ConditionParser,
  ExpressionParseResult,
  ParseInput,
} from "../types.js";
import { parseLeadingConditionalExpression } from "./composed-expression.js";

const powerContinuationSelection =
  "selected:power-continuation-target" as SelectionId;

type ModifyPowerEffect = Extract<Effect, { type: "modifyPower" }>;
type SelectTargetsEffect = Extract<Effect, { type: "selectTargets" }>;
type SelectableTarget = Extract<Target, { type: "choose" | "chooseFromZones" }>;

export function selectedPowerContinuationExpressionParser(
  input: ParseInput,
): ExpressionParseResult | undefined {
  const split =
    /^(?<first>.+?)\.\s+Then,\s+that card gains an additional \+(?<amount>[1-9]\d*) power (?<duration>.+)$/iu.exec(
      input.text,
    );
  const firstText = split?.groups?.["first"];
  const amountText = split?.groups?.["amount"];
  const durationText = split?.groups?.["duration"];
  if (
    firstText === undefined ||
    amountText === undefined ||
    durationText === undefined
  ) {
    return undefined;
  }

  const first = parseModifyPowerInstruction({ text: `${firstText}.` });
  if (
    first === undefined ||
    first.rest.length > 0 ||
    first.effect.type !== "modifyPower" ||
    !isSelectableTarget(first.effect.target)
  ) {
    return undefined;
  }

  const duration = parseDurationFromSet(
    { text: durationText },
    fieldEffectDurationParsers,
  );
  if (
    duration === undefined ||
    duration.duration === undefined ||
    duration.rest.length > 0
  ) {
    return undefined;
  }

  const savedTarget = savedFieldObjectTarget(first.effect.target);
  const selectionEffect = selectTargetsEffect(first.effect.target);
  if (savedTarget === undefined || selectionEffect === undefined) {
    return undefined;
  }
  const firstPower: ModifyPowerEffect = {
    ...first.effect,
    target: savedTarget,
  };
  const additionalPower: ModifyPowerEffect = {
    type: "modifyPower",
    target: savedTarget,
    value: Number.parseInt(amountText, 10),
    duration: duration.duration,
  };

  return {
    effect: {
      type: "sequence",
      effects: [
        {
          id: "select:power-continuation-target",
          connector: "always",
          saveResultAs: powerContinuationSelection,
          effect: selectionEffect,
        },
        {
          id: "power:first-selected-target",
          connector: "then",
          effect: firstPower,
        },
        {
          id: "power:additional-selected-target",
          connector: "then",
          effect: additionalPower,
        },
      ],
    },
    evidence: [
      "composition:selectThenApply",
      ...first.evidence,
      "target:selectedCharacter",
      "modifier:positivePower",
      ...duration.evidence,
    ],
    rest: "",
  };
}

export function conditionalSelectedPowerContinuationExpressionParser(options: {
  readonly conditions: readonly ConditionParser[];
}): (input: ParseInput) => ExpressionParseResult | undefined {
  return (input) => {
    const parsed = parseLeadingConditionalExpression(
      input.text,
      options.conditions,
    );
    if (parsed === undefined) {
      return undefined;
    }
    const then = selectedPowerContinuationExpressionParser({
      text: parsed.thenText,
    });
    if (then === undefined || then.rest.length > 0) {
      return undefined;
    }
    return {
      effect: {
        type: "conditional",
        if: parsed.condition.condition,
        then: then.effect,
      },
      evidence: [
        "expression:conditional",
        ...parsed.condition.evidence,
        ...then.evidence,
      ],
      rest: "",
    };
  };
}

function isSelectableTarget(target: Target): target is SelectableTarget {
  return target.type === "choose" || target.type === "chooseFromZones";
}

function selectTargetsEffect(
  target: SelectableTarget,
): SelectTargetsEffect | undefined {
  if (target.type === "choose") {
    const request = target.request;
    if (!isSavedFieldObjectZone(request.zone)) {
      return undefined;
    }
    return {
      type: "selectTargets",
      request: {
        ...request,
        zone: request.zone,
        visibility: "public",
      } satisfies SelectedTargetsRequest,
    };
  }
  const request = target.request;
  if (!request.zones.every(isSavedFieldObjectZone)) {
    return undefined;
  }
  return {
    type: "selectTargets",
    request: {
      ...request,
      zones: request.zones,
      visibility: "public",
    } satisfies MultiZoneTargetRequest,
  };
}

function savedFieldObjectTarget(target: SelectableTarget): Target | undefined {
  if (target.type === "choose") {
    const request = target.request;
    if (!isSavedFieldObjectZone(request.zone)) {
      return undefined;
    }
    return {
      type: "savedFieldObject",
      binding: {
        family: "selectedTargets",
        saveResultAs: powerContinuationSelection,
      },
      zone: request.zone,
      player: request.player,
      visibility: "publicOnly",
      onFailure: "failClosed",
    };
  }
  const request = target.request;
  if (!request.zones.every(isSavedFieldObjectZone)) {
    return undefined;
  }
  return {
    type: "savedFieldObject",
    binding: {
      family: "selectedTargets",
      saveResultAs: powerContinuationSelection,
    },
    zones: request.zones,
    player: request.player,
    visibility: "publicOnly",
    onFailure: "failClosed",
  };
}

function isSavedFieldObjectZone(zone: string): zone is SavedFieldObjectZone {
  return (
    zone === "leaderArea" ||
    zone === "characterArea" ||
    zone === "stageArea" ||
    zone === "costArea"
  );
}
