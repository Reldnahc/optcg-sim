import type { Condition } from "@optcg/types";

import type { ExpressionParseResult, ParseInput } from "../../types.js";
import {
  parseFieldPresenceCondition,
  parseLeaderNameCondition,
} from "../../conditions/index.js";
import { sourceSpan } from "../../source-slices.js";
import {
  parseAnyFieldRemovalReplacement,
  parseCombinedKoOrFieldRemovalReplacement,
  parseOpponentFieldRemovalReplacement,
  parseOpponentKoReplacement,
  parseOpponentRestReplacement,
} from "./trigger-conditions.js";
import type { ReplacementTriggerParseResult } from "./shared.js";

type ParsedReplacement = ReplacementTriggerParseResult & {
  readonly condition?: NonNullable<
    ExpressionParseResult["blockPatch"]
  >["condition"];
  readonly conditionEvidence?: ExpressionParseResult["evidence"];
};

export function replacementInsteadExpressionParser(
  input: ParseInput,
): ExpressionParseResult | undefined {
  if (
    input.entryPoint?.category !== "replacement" ||
    input.entryPoint.trigger.type !== "replacement"
  ) {
    return undefined;
  }

  const parsed: ParsedReplacement | undefined =
    parseConditionalReplacement(input.text) ??
    parseNegatedPresenceReplacement(input.text) ??
    parseReplacementTrigger(input.text);
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
      ...(parsed.conditionEvidence ?? []),
      ...parsed.evidence,
    ],
    ...(input.source === undefined
      ? {}
      : {
          presentationSpans: [
            sourceSpan("span:body", "body", input.source, parsed.evidence),
          ],
        }),
    rest: "",
    blockPatch: {
      category: "replacement",
      optional: parsed.optional,
      ...(parsed.condition === undefined
        ? {}
        : { condition: parsed.condition }),
      trigger: { type: "replacement", replacement: parsed.when },
    },
  };
}

const parseReplacementTrigger = (
  text: string,
): ReplacementTriggerParseResult | undefined =>
  parseCombinedKoOrFieldRemovalReplacement(text) ??
  parseOpponentKoReplacement(text) ??
  parseOpponentRestReplacement(text) ??
  parseOpponentFieldRemovalReplacement(text) ??
  parseAnyFieldRemovalReplacement(text);

const parseConditionalReplacement = (
  text: string,
): ParsedReplacement | undefined => {
  const bodyText = /^If (?<body>.+)$/iu.exec(text.trim())?.groups?.["body"];
  if (bodyText === undefined) {
    return undefined;
  }

  for (const split of leaderConditionReplacementSplits(bodyText)) {
    const condition = parseLeaderNameCondition({ text: split.conditionText });
    if (condition === undefined || condition.rest.length > 0) {
      continue;
    }
    const replacement = parseReplacementTrigger(`If ${split.replacementText}`);
    if (replacement === undefined) {
      continue;
    }
    return {
      ...replacement,
      condition: condition.condition,
      conditionEvidence: ["expression:conditional", ...condition.evidence],
    };
  }

  return undefined;
};

const parseNegatedPresenceReplacement = (
  text: string,
): ParsedReplacement | undefined => {
  const split = splitNegatedPresenceSuffix(text);
  if (split === undefined) {
    return undefined;
  }

  const replacement: ParsedReplacement | undefined =
    parseConditionalReplacement(split.replacementText) ??
    parseReplacementTrigger(split.replacementText);
  if (replacement === undefined) {
    return undefined;
  }

  const presence = parseFieldPresenceCondition({
    text: split.presenceConditionText,
  });
  if (presence === undefined || presence.rest.length > 0) {
    return undefined;
  }

  return {
    ...replacement,
    condition: combineConditions(replacement.condition, {
      type: "not",
      condition: presence.condition,
    }),
    conditionEvidence: [
      "expression:conditional",
      "composition:conditionNot",
      ...presence.evidence,
    ],
  };
};

function splitNegatedPresenceSuffix(
  text: string,
):
  | { readonly replacementText: string; readonly presenceConditionText: string }
  | undefined {
  const match =
    /^(?<replacementText>.+?)\.\s+If (?<presenceConditionText>.+?),\s*this effect is negated\.?$/iu.exec(
      text.trim(),
    );
  const replacementText = match?.groups?.["replacementText"]?.trim();
  const presenceConditionText =
    match?.groups?.["presenceConditionText"]?.trim();
  if (
    replacementText === undefined ||
    presenceConditionText === undefined ||
    replacementText.length === 0 ||
    presenceConditionText.length === 0
  ) {
    return undefined;
  }

  return { replacementText, presenceConditionText };
}

function combineConditions(
  left: Condition | undefined,
  right: Condition,
): Condition {
  if (left === undefined) {
    return right;
  }
  if (left.type === "and") {
    return { type: "and", conditions: [...left.conditions, right] };
  }
  return { type: "and", conditions: [left, right] };
}

function* leaderConditionReplacementSplits(text: string): Iterable<{
  readonly conditionText: string;
  readonly replacementText: string;
}> {
  const separator = /\s+and\s+/giu;
  for (const match of text.matchAll(separator)) {
    yield {
      conditionText: text.slice(0, match.index).trim(),
      replacementText: text.slice(match.index + match[0].length).trim(),
    };
  }
}
