import type { CardId, Effect, EffectBlock } from "@optcg/types";

import {
  deriveConditionalConditionDiagnostics,
  parseKeywordGrantBody,
  parseConditionExpression,
  parseProtectionBody,
  type ParsedConditionComponent,
} from "./conditional-parser-components.js";
import {
  parseIfWrapper,
  parseOncePerTurnWrapper,
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
  readonly effects: readonly [Effect, Effect];
};

export const conditionalContinuousTrashCountParserRuleId =
  "exact:conditional-continuous:trash-count:keyword-grant-and-protection:self-character";

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
  const conditional = parseIfWrapper(sourceText);
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
  if (!isSupportedConditionalContinuousTrashCountCondition(condition)) {
    return undefined;
  }

  const split = splitBodyConjunction(conditional.bodyText.replace(/\.$/, ""));
  if (split === undefined) {
    return undefined;
  }
  const left = parseContinuousBodyPart(split.left);
  const right = parseContinuousBodyPart(split.right, {
    inferSharedSelfCharacterTarget: left?.kind === "protection",
  });
  if (left === undefined || right === undefined || left.kind === right.kind) {
    return undefined;
  }

  return { condition, effects: [left.effect, right.effect] };
}

export function buildConditionalContinuousCompositionClause(
  cardId: CardId,
  parsed: ConditionalContinuousCompositionParse,
): { effectBlock: EffectBlock; parserRuleId: string } {
  return {
    effectBlock: {
      category: "permanent",
      condition: parsed.condition,
      effect: {
        effects: [
          { connector: "always", effect: parsed.effects[0], id: "grant-1" },
          { connector: "always", effect: parsed.effects[1], id: "grant-2" },
        ],
        type: "sequence",
      },
      id: toEffectId(`${String(cardId)}:permanent-conditional-continuous-v1`),
      sourcePresencePolicy: "mustRemainInSameZone",
      trigger: { type: "permanent" },
    },
    parserRuleId: conditionalContinuousTrashCountParserRuleId,
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

function isSupportedConditionalContinuousTrashCountCondition(
  condition: NonNullable<EffectBlock["condition"]>,
): condition is Extract<
  NonNullable<EffectBlock["condition"]>,
  { type: "trashCount" }
> {
  return (
    condition.type === "trashCount" &&
    condition.filter === undefined &&
    (condition.player === "self" || condition.player === "opponent")
  );
}

function splitBodyConjunction(
  bodyText: string,
): { left: string; right: string } | undefined {
  const matches = [...bodyText.matchAll(/\s+and\s+/gi)];
  if (matches.length !== 1) {
    return undefined;
  }
  const match = matches[0];
  if (match === undefined) {
    return undefined;
  }
  const connectorStart = match.index + 1;
  const connectorEnd = connectorStart + "and".length;
  const left = bodyText.slice(0, connectorStart).trim();
  const right = bodyText.slice(connectorEnd).trim();
  if (left.length === 0 || right.length === 0) {
    return undefined;
  }
  return { left, right };
}

function parseContinuousBodyPart(
  bodyText: string,
  options?: { inferSharedSelfCharacterTarget: boolean },
): { effect: Effect; kind: "keyword-grant" | "protection" } | undefined {
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
      kind: "protection",
    };
  }

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
      kind: "keyword-grant",
    };
  }

  return undefined;
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
