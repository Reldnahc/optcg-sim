import type { ExpressionParseResult, ParseInput } from "../../types.js";
import { parseLeaderNameCondition } from "../../conditions/index.js";
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
      optional: true,
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
  const match =
    /^If (?<condition>your Leader's type includes\s+(?:"[^"]+"|[^,]+?)) and (?<replacement>.+)$/iu.exec(
      text.trim(),
    );
  const conditionText = match?.groups?.["condition"];
  const replacementText = match?.groups?.["replacement"];
  if (conditionText === undefined || replacementText === undefined) {
    return undefined;
  }
  const condition = parseLeaderNameCondition({ text: conditionText });
  if (condition === undefined || condition.rest.length > 0) {
    return undefined;
  }
  const replacement = parseReplacementTrigger(`If ${replacementText}`);
  if (replacement === undefined) {
    return undefined;
  }
  return {
    ...replacement,
    condition: condition.condition,
    conditionEvidence: ["expression:conditional", ...condition.evidence],
  };
};
