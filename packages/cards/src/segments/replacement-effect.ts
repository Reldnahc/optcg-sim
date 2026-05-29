import type { Effect } from "@optcg/types";

import { parseYourFieldReplacementTarget } from "../targets/replacement-targets.js";
import type { ExpressionParseResult, ParseInput } from "../types.js";

export function replacementInsteadExpressionParser(
  input: ParseInput,
): ExpressionParseResult | undefined {
  if (
    input.entryPoint?.category !== "replacement" ||
    input.entryPoint.trigger.type !== "replacement"
  ) {
    return undefined;
  }

  const parsed = parseOpponentFieldRemovalReplacement(input.text);
  if (parsed === undefined) {
    return undefined;
  }

  return {
    effect: {
      type: "replacement",
      when: parsed.when,
      instead: parsed.instead,
    },
    evidence: [
      "expression:replacement",
      "composition:replacementInstead",
      "replacement:wouldMoveZone",
      "replacement:fieldRemoval",
      "replacementSource:opponent",
      ...parsed.evidence,
    ],
    rest: "",
    blockPatch: {
      category: "replacement",
      optional: true,
      trigger: { type: "replacement", replacement: parsed.when },
    },
  };
}

function parseOpponentFieldRemovalReplacement(text: string):
  | {
      readonly when: Extract<Effect, { type: "replacement" }>["when"];
      readonly instead: Effect;
      readonly evidence: ExpressionParseResult["evidence"];
    }
  | undefined {
  const match =
    /^If (?<target>.+?) would be removed from the field by your opponent,\s*(?<body>.+)$/i.exec(
      text.trim(),
    );
  const targetText = match?.groups?.["target"];
  const bodyText = match?.groups?.["body"];
  if (targetText === undefined || bodyText === undefined) {
    return undefined;
  }

  const target = parseYourFieldReplacementTarget({ text: targetText });
  if (
    target === undefined ||
    target.rest.length > 0 ||
    target.target.type !== "all"
  ) {
    return undefined;
  }
  const instead = parseTopLifeToHandInstead(bodyText);
  if (instead === undefined) {
    return undefined;
  }

  return {
    when: {
      type: "wouldMoveZone",
      from: target.target.zone,
      target: target.target,
    },
    instead: instead.effect,
    evidence: [...target.evidence, ...instead.evidence],
  };
}

function parseTopLifeToHandInstead(text: string):
  | {
      readonly effect: Effect;
      readonly evidence: ExpressionParseResult["evidence"];
    }
  | undefined {
  const match =
    /^you may add (?<count>[1-9]\d*) cards? from the top of your Life cards to your hand instead\.?$/i.exec(
      text.trim(),
    );
  const countText = match?.groups?.["count"];
  if (countText === undefined) {
    return undefined;
  }

  return {
    effect: {
      type: "moveCards",
      count: Number.parseInt(countText, 10),
      from: { player: "self", zone: "life", position: "top" },
      to: { player: "self", zone: "hand" },
      order: "original",
    },
    evidence: [
      "instruction:moveCards",
      "count:positiveInteger",
      "player:self",
      "zone:life",
      "position:top",
      "destination:hand",
      "order:original",
    ],
  };
}
