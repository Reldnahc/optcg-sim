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
import {
  parseModifyPowerInstruction,
  parseSetFieldActiveInstruction,
  parseSelectTargetsInstruction,
} from "../instructions/index.js";
import {
  allPowerModifierParsers,
  parseModifierFromSet,
} from "../modifiers/index.js";
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
const distributedPowerSelection =
  "selected:distributed-power-targets" as SelectionId;

type ModifyPowerEffect = Extract<Effect, { type: "modifyPower" }>;
type SelectTargetsEffect = Extract<Effect, { type: "selectTargets" }>;
type SequenceEffect = Extract<Effect, { type: "sequence" }>;
type SelectableTarget = Extract<Target, { type: "choose" | "chooseFromZones" }>;
type PowerModifier = {
  readonly value: number;
  readonly evidence: readonly PrimitiveEvidence[];
};

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
  const distributedPower = parseSelectedDistributedPower(input);
  if (distributedPower !== undefined) {
    return distributedPower;
  }

  const fieldActivationPower =
    parseSelectedFieldActivationPowerContinuation(input);
  if (fieldActivationPower !== undefined) {
    return fieldActivationPower;
  }

  const explicitSelectContinuation = parseExplicitSelectKeywordContinuation(
    input,
    options,
  );
  if (explicitSelectContinuation !== undefined) {
    return explicitSelectContinuation;
  }

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

  const koProtectionContinuation =
    parseSelectedPowerKoProtectionContinuation(input);
  if (koProtectionContinuation !== undefined) {
    return koProtectionContinuation;
  }

  const split =
    /^(?<first>.+?)\.\s+Then,\s+(?:if (?<condition>.+?),\s+)?that card gains an additional \+(?<amount>[1-9]\d*) power(?: (?<duration>.+?))?\.?$/iu.exec(
      input.text,
    );
  const firstText = split?.groups?.["first"];
  const conditionText = split?.groups?.["condition"];
  const amountText = split?.groups?.["amount"];
  const durationText = split?.groups?.["duration"];
  if (firstText === undefined || amountText === undefined) {
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

  const duration =
    durationText === undefined
      ? { duration: first.effect.duration, evidence: [] as const, rest: "" }
      : parseDurationFromSet(
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

function parseSelectedDistributedPower(
  input: ParseInput,
): ExpressionParseResult | undefined {
  const split =
    /^(?<selection>Select up to [1-9]\d* .+?),\s+and give 1 Character (?<first>[+\-−][1-9]\d* power) and the other (?<second>[+\-−][1-9]\d* power) (?<duration>.+)$/iu.exec(
      input.text,
    );
  const selectionText = split?.groups?.["selection"];
  const firstModifierText = split?.groups?.["first"];
  const secondModifierText = split?.groups?.["second"];
  const durationText = split?.groups?.["duration"];
  if (
    selectionText === undefined ||
    firstModifierText === undefined ||
    secondModifierText === undefined ||
    durationText === undefined
  ) {
    return undefined;
  }

  const selection = parseSelectTargetsInstruction({
    text: `${selectionText}.`,
  });
  if (
    selection === undefined ||
    selection.rest.length > 0 ||
    selection.effect.type !== "selectTargets"
  ) {
    return undefined;
  }
  const firstModifier = parsePowerModifier(firstModifierText);
  const secondModifier = parsePowerModifier(secondModifierText);
  if (firstModifier === undefined || secondModifier === undefined) {
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

  const firstTarget = savedFieldObjectTargetFromSelect(
    selection.effect,
    distributedPowerSelection,
    0,
  );
  const secondTarget = savedFieldObjectTargetFromSelect(
    selection.effect,
    distributedPowerSelection,
    1,
  );
  if (firstTarget === undefined || secondTarget === undefined) {
    return undefined;
  }

  return {
    effect: {
      type: "sequence",
      effects: [
        {
          id: "select:distributed-power-targets",
          connector: "always",
          saveResultAs: distributedPowerSelection,
          effect: selection.effect,
        },
        {
          id: "power:first-distributed-selected-target",
          connector: "then",
          effect: {
            type: "modifyPower",
            target: firstTarget,
            value: firstModifier.value,
            duration: duration.duration,
          },
        },
        {
          id: "power:other-distributed-selected-target",
          connector: "then",
          effect: {
            type: "modifyPower",
            target: secondTarget,
            value: secondModifier.value,
            duration: duration.duration,
          },
        },
      ],
    },
    evidence: [
      "composition:selectThenApply",
      ...selection.evidence,
      "instruction:modifyPower",
      ...firstModifier.evidence,
      ...secondModifier.evidence,
      ...duration.evidence,
    ],
    rest: "",
  };
}

function parseSelectedFieldActivationPowerContinuation(
  input: ParseInput,
): ExpressionParseResult | undefined {
  const split =
    /^(?<first>.+?)\.\s+(?:Then,\s+)?It gains (?<modifier>[+\-−][1-9]\d* power) (?<duration>.+)$/iu.exec(
      input.text,
    );
  const firstText = split?.groups?.["first"];
  const modifierText = split?.groups?.["modifier"];
  const durationText = split?.groups?.["duration"];
  if (
    firstText === undefined ||
    modifierText === undefined ||
    durationText === undefined
  ) {
    return undefined;
  }

  const first = parseSetFieldActiveInstruction({ text: `${firstText}.` });
  if (
    first === undefined ||
    first.rest.length > 0 ||
    first.effect.type !== "sequence"
  ) {
    return undefined;
  }
  const selection = selectedTargetProducer(first.effect);
  if (selection === undefined) {
    return undefined;
  }
  const savedTarget = savedFieldObjectTargetFromSelect(
    selection.effect,
    selection.saveResultAs,
  );
  if (savedTarget === undefined) {
    return undefined;
  }

  const modifier = parsePowerModifier(modifierText);
  const duration = parseDurationFromSet(
    { text: durationText },
    fieldEffectDurationParsers,
  );
  if (
    modifier === undefined ||
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
        ...first.effect.effects,
        {
          id: "power:selected-field-activation-target",
          connector: "then",
          effect: {
            type: "modifyPower",
            target: savedTarget,
            value: modifier.value,
            duration: duration.duration,
          },
        },
      ],
    },
    evidence: [
      ...first.evidence,
      "instruction:modifyPower",
      "target:selectedCharacter",
      ...modifier.evidence,
      ...duration.evidence,
    ],
    rest: "",
  };
}

function parseExplicitSelectKeywordContinuation(
  input: ParseInput,
  options: {
    readonly additionalConditionParsers?: readonly ConditionParser[];
  },
): ExpressionParseResult | undefined {
  const split =
    /^(?<first>Select .+?)\.\s+Then,\s+(?:if (?<condition>.+?),\s+)?that card gains (?<keyword>\[[^\]]+\].+)$/iu.exec(
      input.text,
    );
  const firstText = split?.groups?.["first"];
  const conditionText = split?.groups?.["condition"];
  const keywordText = split?.groups?.["keyword"];
  if (firstText === undefined || keywordText === undefined) {
    return undefined;
  }

  const first = parseSelectTargetsInstruction({ text: `${firstText}.` });
  if (
    first === undefined ||
    first.rest.length > 0 ||
    first.effect.type !== "selectTargets"
  ) {
    return undefined;
  }

  const savedTarget = savedFieldObjectTargetFromSelect(first.effect);
  if (savedTarget === undefined) {
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

  const keyword = parseKeywordGrantForTarget({
    target: savedTarget,
    targetEvidence: ["target:selectedCharacter"],
    text: keywordText,
    context: { condition: undefined },
  });
  if (keyword === undefined || keyword.rest.length > 0) {
    return undefined;
  }

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
          effect: first.effect,
        },
        {
          id: "keyword:selected-target",
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

function parseSelectedPowerKoProtectionContinuation(
  input: ParseInput,
): ExpressionParseResult | undefined {
  const split =
    /^(?<first>.+?)\.\s+(?:Then,\s+)?If that card is a Character,\s+that Character cannot be K\.O\.'d (?<duration>.+)$/iu.exec(
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
          id: "protection:selected-character-target",
          connector: "then",
          effect: {
            type: "conditional",
            if: {
              type: "cardMatches",
              target: savedTarget,
              filter: { categories: ["character"] },
            },
            then: {
              type: "protectFromKO",
              target: savedTarget,
              duration: duration.duration,
            },
          },
        },
      ],
    },
    evidence: [
      "composition:selectThenApply",
      ...first.evidence,
      "target:selectedCharacter",
      "composition:savedTargetCondition",
      "condition:cardMatches",
      "filter:category:character",
      "instruction:giveProtection",
      "protectionProcess:ko",
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

function parsePowerModifier(text: string): PowerModifier | undefined {
  const modifier = parseModifierFromSet({ text }, allPowerModifierParsers);
  if (modifier === undefined || modifier.rest.length > 0) {
    return undefined;
  }
  return { value: modifier.value, evidence: modifier.evidence };
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

function savedFieldObjectTargetFromSelect(
  effect: SelectTargetsEffect,
  saveResultAs: SelectionId = powerContinuationSelection,
  objectIndex?: number,
): Target | undefined {
  const request = effect.request;
  if ("zone" in request) {
    if (!isSavedFieldObjectZone(request.zone)) {
      return undefined;
    }
    return {
      type: "savedFieldObject",
      binding: {
        family: "selectedTargets",
        saveResultAs,
        ...(objectIndex === undefined ? {} : { objectIndex }),
      },
      zone: request.zone,
      player: request.player,
      visibility: "publicOnly",
      onFailure: "failClosed",
    };
  }
  if (!request.zones.every(isSavedFieldObjectZone)) {
    return undefined;
  }
  return {
    type: "savedFieldObject",
    binding: {
      family: "selectedTargets",
      saveResultAs,
      ...(objectIndex === undefined ? {} : { objectIndex }),
    },
    zones: request.zones,
    player: request.player,
    visibility: "publicOnly",
    onFailure: "failClosed",
  };
}

function selectedTargetProducer(
  effect: SequenceEffect,
):
  | { readonly effect: SelectTargetsEffect; readonly saveResultAs: SelectionId }
  | undefined {
  for (const segment of effect.effects) {
    if (
      segment.effect.type === "selectTargets" &&
      segment.saveResultAs !== undefined
    ) {
      return {
        effect: segment.effect,
        saveResultAs: segment.saveResultAs as SelectionId,
      };
    }
  }
  return undefined;
}

function isSavedFieldObjectZone(zone: string): zone is SavedFieldObjectZone {
  return (
    zone === "leaderArea" ||
    zone === "characterArea" ||
    zone === "stageArea" ||
    zone === "costArea"
  );
}
