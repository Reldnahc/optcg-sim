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
  refreshRestrictionDurationParsers,
} from "../durations/index.js";
import { parseKeywordGrantForTarget } from "../instructions/continuous-field-effects/keyword-grants/shared.js";
import { parseModifyPowerInstruction } from "../instructions/index.js";
import type {
  ConditionParser,
  ExpressionParseResult,
  ParseInput,
  PrimitiveEvidence,
} from "../types.js";
import {
  parseConditionExpression,
  parseLeadingConditionalExpression,
} from "./composed-expression.js";

const powerContinuationSelection =
  "selected:power-continuation-target" as SelectionId;

type ModifyPowerEffect = Extract<Effect, { type: "modifyPower" }>;
type SelectTargetsEffect = Extract<Effect, { type: "selectTargets" }>;
type SelectableTarget = Extract<Target, { type: "choose" | "chooseFromZones" }>;

export function selectedPowerContinuationExpressionParser(
  input: ParseInput,
): ExpressionParseResult | undefined {
  return parseSelectedPowerContinuation(input);
}

export function conditionalAdditionalSelectedPowerContinuationExpressionParser(options: {
  readonly conditions: readonly ConditionParser[];
}): (input: ParseInput) => ExpressionParseResult | undefined {
  return (input) =>
    parseSelectedPowerContinuation(input, {
      additionalConditionParsers: options.conditions,
    });
}

function parseSelectedPowerContinuation(
  input: ParseInput,
  options: {
    readonly additionalConditionParsers?: readonly ConditionParser[];
  } = {},
): ExpressionParseResult | undefined {
  const keywordContinuation = parseSelectedPowerKeywordContinuation(
    input,
    options,
  );
  if (keywordContinuation !== undefined) {
    return keywordContinuation;
  }

  const refreshLockContinuation =
    parseSelectedPowerRefreshLockContinuation(input);
  if (refreshLockContinuation !== undefined) {
    return refreshLockContinuation;
  }

  const split =
    /^(?<first>.+?)\.\s+Then,\s+(?:if (?<condition>.+?),\s+)?that card gains an additional \+(?<amount>[1-9]\d*) power (?<duration>.+)$/iu.exec(
      input.text,
    );
  const firstText = split?.groups?.["first"];
  const conditionText = split?.groups?.["condition"];
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
  const additionalCondition =
    conditionText === undefined
      ? undefined
      : parseConditionExpression(
          conditionText,
          options.additionalConditionParsers ?? [],
        );
  if (conditionText !== undefined && additionalCondition === undefined) {
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
  const additionalEffect: Effect =
    additionalCondition === undefined
      ? additionalPower
      : {
          type: "conditional",
          if: additionalCondition.condition,
          then: additionalPower,
        };
  const additionalConditionEvidence: readonly PrimitiveEvidence[] =
    additionalCondition === undefined
      ? []
      : ["expression:conditional", ...additionalCondition.evidence];

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
          effect: additionalEffect,
        },
      ],
    },
    evidence: [
      "composition:selectThenApply",
      ...first.evidence,
      "target:selectedCharacter",
      "modifier:positivePower",
      ...additionalConditionEvidence,
      ...duration.evidence,
    ],
    rest: "",
  };
}

function parseSelectedPowerRefreshLockContinuation(
  input: ParseInput,
): ExpressionParseResult | undefined {
  const split =
    /^(?<first>.+?)\.\s+Then,\s+the selected Character will not become active (?<duration>.+)$/iu.exec(
      input.text,
    );
  const firstText = split?.groups?.["first"];
  const durationText = split?.groups?.["duration"];
  if (firstText === undefined || durationText === undefined) {
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

  const savedTarget = savedFieldObjectTarget(first.effect.target);
  const selectionEffect = selectTargetsEffect(first.effect.target);
  if (savedTarget === undefined || selectionEffect === undefined) {
    return undefined;
  }

  const duration = parseDurationFromSet(
    { text: durationText },
    refreshRestrictionDurationParsers,
  );
  if (
    duration === undefined ||
    duration.duration === undefined ||
    duration.rest.length > 0
  ) {
    return undefined;
  }

  const firstPower: ModifyPowerEffect = {
    ...first.effect,
    target: savedTarget,
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
          id: "refresh-lock:selected-power-target",
          connector: "then",
          effect: {
            type: "cannotBecomeActive",
            target: savedTarget,
            duration: duration.duration,
          },
        },
      ],
    },
    evidence: [
      "composition:selectThenApply",
      ...first.evidence,
      "target:selectedCharacter",
      "instruction:preventActivation",
      ...duration.evidence,
    ],
    rest: "",
  };
}

function parseSelectedPowerKeywordContinuation(
  input: ParseInput,
  options: {
    readonly additionalConditionParsers?: readonly ConditionParser[];
  },
): ExpressionParseResult | undefined {
  const split =
    /^(?<first>.+?)\.\s+Then,\s+(?:if (?<condition>.+?),\s+)?that card gains (?<keyword>\[[^\]]+\].+)$/iu.exec(
      input.text,
    );
  const firstText = split?.groups?.["first"];
  const conditionText = split?.groups?.["condition"];
  const keywordText = split?.groups?.["keyword"];
  if (firstText === undefined || keywordText === undefined) {
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

  const additionalCondition =
    conditionText === undefined
      ? undefined
      : parseConditionExpression(
          conditionText,
          options.additionalConditionParsers ?? [],
        );
  if (conditionText !== undefined && additionalCondition === undefined) {
    return undefined;
  }

  const savedTarget = savedFieldObjectTarget(first.effect.target);
  const selectionEffect = selectTargetsEffect(first.effect.target);
  if (savedTarget === undefined || selectionEffect === undefined) {
    return undefined;
  }

  const keyword = parseKeywordGrantForTarget({
    target: savedTarget,
    targetEvidence: ["target:selectedCharacter"],
    text: keywordText,
    context: { condition: undefined },
  });
  if (keyword === undefined || keyword.rest.length > 0) {
    return undefined;
  }

  const firstPower: ModifyPowerEffect = {
    ...first.effect,
    target: savedTarget,
  };
  const keywordEffect: Effect =
    additionalCondition === undefined
      ? keyword.effect
      : {
          type: "conditional",
          if: additionalCondition.condition,
          then: keyword.effect,
        };
  const additionalConditionEvidence: readonly PrimitiveEvidence[] =
    additionalCondition === undefined
      ? []
      : ["expression:conditional", ...additionalCondition.evidence];

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
          id: "keyword:selected-power-target",
          connector: "then",
          effect: keywordEffect,
        },
      ],
    },
    evidence: [
      "composition:selectThenApply",
      ...first.evidence,
      ...keyword.evidence,
      ...additionalConditionEvidence,
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
