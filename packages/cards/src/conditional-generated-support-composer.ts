import type { CardId, Condition, Effect, EffectBlock } from "@optcg/types";

import {
  deriveConditionalConditionDiagnostics,
  parseKeywordGrantBody,
  parseConditionExpression,
  parseProtectionBody,
  type ParsedConditionComponent,
} from "./conditional-parser-components.js";
import { resolveConditionalContinuousCompositionParserRuleId } from "./conditional-continuous-composition-evidence.js";
import {
  parseIfWrapper,
  parseOncePerTurnWrapper,
  parseExactPositiveSafeInteger,
  parseSupportedTriggerWrapper,
  toEffectId,
} from "./composed-parser-builder.js";

export type ConditionalWrapperParse = {
  readonly bodyText: string;
  readonly condition: NonNullable<EffectBlock["condition"]>;
  readonly prefix: string;
};

export type ConditionalContinuousCompositionParse = {
  readonly condition: NonNullable<EffectBlock["condition"]>;
  readonly effects: readonly [Effect, ...Effect[]];
};

type ConditionalContinuousIfParse = {
  readonly bodyText: string;
  readonly conditionText: string;
  readonly includesYourTurnPrefix: boolean;
};

export function parseConditionalWrapper(
  sourceText: string,
): ConditionalWrapperParse | undefined {
  const wrapper = parseSupportedTriggerWrapper(sourceText);
  if (wrapper === undefined) {
    return undefined;
  }

  const oncePerTurn = parseOncePerTurnWrapper(wrapper.bodyText);
  const conditionalBody =
    oncePerTurn === undefined ? wrapper.bodyText : oncePerTurn.bodyText;
  const conditional = parseIfWrapper(conditionalBody);
  if (conditional === undefined) {
    return undefined;
  }
  const conditionDiagnostics = deriveConditionalConditionDiagnostics(
    conditional.conditionText,
  );
  if (conditionDiagnostics.hasAmbiguousMixedConnectors) {
    return undefined;
  }

  const condition = toDslCondition(
    parseConditionExpression(conditional.conditionText),
  );
  if (condition === undefined) {
    return undefined;
  }

  return {
    bodyText: conditional.bodyText,
    condition,
    prefix: `${wrapper.prefix}${oncePerTurn?.prefix ?? ""}`,
  };
}

export function parseConditionalContinuousComposition(
  sourceText: string,
): ConditionalContinuousCompositionParse | undefined {
  const conditional = parseConditionalContinuousIf(sourceText);
  if (conditional === undefined) {
    return undefined;
  }

  const conditionDiagnostics = deriveConditionalConditionDiagnostics(
    conditional.conditionText,
  );
  if (conditionDiagnostics.hasAmbiguousMixedConnectors) {
    return undefined;
  }
  const parsedCondition = toDslCondition(
    parseConditionExpression(conditional.conditionText),
  );
  if (parsedCondition === undefined) {
    return undefined;
  }
  const condition = conditional.includesYourTurnPrefix
    ? withYourTurnCondition(parsedCondition)
    : parsedCondition;
  const bodyParts = splitBodyConjunctionParts(
    conditional.bodyText.replace(/\.$/, ""),
  );
  if (bodyParts === undefined) {
    return undefined;
  }
  if (
    conditional.includesYourTurnPrefix &&
    (bodyParts.length !== 1 ||
      parseBasePowerSetterBody(bodyParts[0]) === undefined)
  ) {
    return undefined;
  }

  const parsedEffects: Effect[] = [];
  let canInferSharedSelfCharacterTarget = false;
  for (const part of bodyParts) {
    const parsedPart = parseContinuousBodyPart(part, {
      inferSharedSelfCharacterTarget: canInferSharedSelfCharacterTarget,
    });
    if (parsedPart === undefined) {
      return undefined;
    }

    parsedEffects.push(parsedPart.effect);
    canInferSharedSelfCharacterTarget = parsedPart.explicitSelfCharacterTarget;
  }
  const hasBasePower = parsedEffects.some(
    (effect) => effect.type === "setBasePower",
  );
  if (
    hasBasePower &&
    (!conditional.includesYourTurnPrefix ||
      !isSelfTrashCountGteCondition(parsedCondition) ||
      parsedEffects.length !== 1)
  ) {
    return undefined;
  }

  return {
    condition,
    effects: parsedEffects as [Effect, ...Effect[]],
  };
}

export function buildConditionalContinuousCompositionClause(
  cardId: CardId,
  parsed: ConditionalContinuousCompositionParse,
): { effectBlock: EffectBlock; parserRuleId: string } {
  const effect: Effect =
    parsed.effects.length === 1
      ? parsed.effects[0]
      : {
          effects: parsed.effects.map((segmentEffect, index) => ({
            connector: "always" as const,
            effect: segmentEffect,
            id: `part-${String(index + 1)}`,
          })),
          type: "sequence",
        };

  return {
    effectBlock: {
      category: "permanent",
      condition: parsed.condition,
      effect,
      id: toEffectId(`${String(cardId)}:permanent-conditional-continuous-v1`),
      sourcePresencePolicy: "mustRemainInSameZone",
      trigger: { type: "permanent" },
    },
    parserRuleId: resolveConditionalContinuousCompositionParserRuleId(
      parsed.effects,
    ),
  };
}

export function buildConditionalContinuousCompositionClauseFromSource(
  cardId: CardId,
  sourceText: string,
): { effectBlock: EffectBlock; parserRuleId: string } | undefined {
  const parsed = parseConditionalContinuousComposition(sourceText);
  return parsed === undefined
    ? undefined
    : buildConditionalContinuousCompositionClause(cardId, parsed);
}

export function hasPublicDonFieldCountCondition(condition: Condition): boolean {
  switch (condition.type) {
    case "fieldCount":
      return isPublicDonFieldCountCondition(condition);
    case "and":
    case "or":
      return condition.conditions.some((child) =>
        hasPublicDonFieldCountCondition(child),
      );
    case "not":
      return hasPublicDonFieldCountCondition(condition.condition);
    case "attackTarget":
    case "attachedDonCount":
    case "cardState":
    case "custom":
    case "donCount":
    case "eventPayload":
    case "handCount":
    case "hasCardInZone":
    case "leaderColorCount":
    case "lifeCount":
    case "opponentTurn":
    case "sourceStillInZone":
    case "trashCount":
    case "yourTurn":
      return false;
  }
}

function isPublicDonFieldCountCondition(
  condition: Extract<Condition, { type: "fieldCount" }>,
): boolean {
  const filter = condition.filter;
  return (
    (condition.player === "self" || condition.player === "opponent") &&
    filter !== undefined &&
    Object.keys(filter).length === 1 &&
    filter.categories?.length === 1 &&
    filter.categories[0] === "don"
  );
}

function splitBodyConjunctionParts(
  bodyText: string,
): readonly [string, ...string[]] | undefined {
  if (/[;,]/.test(bodyText)) {
    return undefined;
  }

  const matches = [...bodyText.matchAll(/\s+and\s+/gi)];
  if (matches.length === 0) {
    const single = bodyText.trim();
    return single.length === 0 ? undefined : [single];
  }

  const parts = bodyText
    .split(/\s+and\s+/i)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length < 2 || parts.length !== matches.length + 1) {
    return undefined;
  }

  return parts as [string, ...string[]];
}

function parseConditionalContinuousIf(
  sourceText: string,
): ConditionalContinuousIfParse | undefined {
  const yourTurnPrefix = "[Your Turn] ";
  if (sourceText.startsWith(yourTurnPrefix)) {
    const conditional = parseIfWrapper(sourceText.slice(yourTurnPrefix.length));
    return conditional === undefined
      ? undefined
      : {
          bodyText: conditional.bodyText,
          conditionText: conditional.conditionText,
          includesYourTurnPrefix: true,
        };
  }

  const conditional = parseIfWrapper(sourceText);
  return conditional === undefined
    ? undefined
    : {
        bodyText: conditional.bodyText,
        conditionText: conditional.conditionText,
        includesYourTurnPrefix: false,
      };
}

function parseContinuousBodyPart(
  bodyText: string,
  options?: { inferSharedSelfCharacterTarget: boolean },
): { effect: Effect; explicitSelfCharacterTarget: boolean } | undefined {
  const basePower = parseBasePowerSetterBody(bodyText);
  if (basePower !== undefined) {
    return {
      effect: {
        duration: { type: "permanent" },
        target: {
          filter: {
            categories: ["character"],
            typesAny: [basePower.typeName],
          },
          player: "self",
          type: "all",
          zone: "characterArea",
        },
        type: "setBasePower",
        value: basePower.value,
      },
      explicitSelfCharacterTarget: false,
    };
  }

  const protection = parseProtectionBody(bodyText);
  if (protection.type === "supported") {
    return {
      effect: {
        duration: { type: "permanent" },
        protection: {
          process: "fieldRemoval",
          fieldRemoval: {
            classification: "moveFromFieldToOtherZone",
            exclusions: {
              ambiguousCustomRemoval: "excluded",
              battleKO: "excluded",
              controllerCost: "excluded",
              controllerOwnedEffect: "excluded",
              ruleProcessTrash: "excluded",
            },
            processFamily: "fieldRemoval",
            sourceControllerRelation: "opponentControlled",
            sourceKind: "cardEffect",
            targetScope: "thisCard",
          },
        },
        target: { type: "self" },
        type: "giveProtection",
      },
      explicitSelfCharacterTarget: true,
    };
  }

  const hasExplicitSelfCharacterPrefix = /^this Character\s+/i.test(
    bodyText.trim(),
  );
  const keywordText =
    options?.inferSharedSelfCharacterTarget === true &&
    /^(gains|gets)\s+\[[^\]]+\]/i.test(bodyText.trim())
      ? `this Character ${bodyText.trim()}`
      : bodyText;
  const keywordGrant = parseKeywordGrantBody(keywordText);
  if (keywordGrant.type === "supported") {
    return {
      effect: {
        duration: { type: "permanent" },
        keyword: keywordGrant.keyword.component.keyword,
        target: { type: "self" },
        type: "giveKeyword",
      },
      explicitSelfCharacterTarget: hasExplicitSelfCharacterPrefix,
    };
  }

  return undefined;
}

function parseBasePowerSetterBody(
  bodyText: string,
): { readonly typeName: string; readonly value: number } | undefined {
  const match =
    /^set the base power of all of your \{([^{}]+)\} type Characters to (\d+)$/i.exec(
      bodyText.trim(),
    );
  if (match === null) {
    return undefined;
  }

  const typeName = match[1]?.trim() ?? "";
  const value = parseExactPositiveSafeInteger(match[2] ?? "");
  return typeName.length === 0 || value === undefined
    ? undefined
    : { typeName, value };
}

function withYourTurnCondition(
  condition: NonNullable<EffectBlock["condition"]>,
): NonNullable<EffectBlock["condition"]> {
  return {
    conditions: [{ type: "yourTurn" }, condition],
    type: "and",
  };
}

function isSelfTrashCountGteCondition(
  condition: NonNullable<EffectBlock["condition"]>,
): boolean {
  return (
    condition.type === "trashCount" &&
    condition.player === "self" &&
    condition.op === "gte" &&
    condition.filter === undefined
  );
}

function toDslCondition(
  expression: ReturnType<typeof parseConditionExpression>,
): NonNullable<EffectBlock["condition"]> | undefined {
  if (expression.type === "unsupported-fragment") {
    return undefined;
  }

  if (expression.type === "connector") {
    const left = toDslCondition(expression.left);
    const right = toDslCondition(expression.right);
    if (left === undefined || right === undefined) {
      return undefined;
    }

    return expression.connector === "and"
      ? { type: "and", conditions: [left, right] }
      : { type: "or", conditions: [left, right] };
  }

  return toDslConditionComponent(expression.component);
}

function toDslConditionComponent(
  component: ParsedConditionComponent,
): NonNullable<EffectBlock["condition"]> {
  switch (component.type) {
    case "yourTurn":
      return { type: "yourTurn" };
    case "attachedDonCount":
      return {
        op: component.op,
        target: component.target,
        type: "attachedDonCount",
        value: component.value,
      };
    case "leaderColorCount":
      return {
        op: component.op,
        player: component.player,
        type: "leaderColorCount",
        value: component.value,
      };
    case "hasCardInZone":
      return {
        filter: component.filter as unknown as Extract<
          NonNullable<EffectBlock["condition"]>,
          { type: "hasCardInZone" }
        >["filter"],
        player: component.player,
        type: "hasCardInZone",
        zone: component.zone,
      };
    case "fieldCount":
      return {
        filter: { categories: ["don"] },
        op: component.op,
        player: component.player,
        type: "fieldCount",
        value: component.value,
      };
    case "handCount":
    case "lifeCount":
    case "trashCount":
      return {
        op: component.op,
        player: component.player,
        type: component.type,
        value: component.value,
      };
  }
}
