import type { EffectBlock } from "@optcg/types";

import {
  parseConditionExpression,
  type ParsedConditionComponent,
} from "./conditional-parser-components.js";
import {
  parseIfWrapper,
  parseOncePerTurnWrapper,
  parseSupportedTriggerWrapper,
} from "./composed-parser-builder.js";

export type ConditionalWrapperParse = {
  readonly bodyText: string;
  readonly condition: NonNullable<EffectBlock["condition"]>;
  readonly prefix: string;
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
      return {
        op: component.op,
        player: component.player,
        type: component.type,
        value: component.value,
      };
  }
}
