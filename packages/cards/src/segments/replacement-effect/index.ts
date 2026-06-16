import type { ExpressionParseResult, ParseInput } from "../../types.js";
import { sourceSpan } from "../../source-slices.js";
import {
  parseCombinedKoOrFieldRemovalReplacement,
  parseOpponentFieldRemovalReplacement,
  parseOpponentKoReplacement,
} from "./trigger-conditions.js";

export function replacementInsteadExpressionParser(
  input: ParseInput,
): ExpressionParseResult | undefined {
  if (
    input.entryPoint?.category !== "replacement" ||
    input.entryPoint.trigger.type !== "replacement"
  ) {
    return undefined;
  }

  const parsed =
    parseCombinedKoOrFieldRemovalReplacement(input.text) ??
    parseOpponentKoReplacement(input.text) ??
    parseOpponentFieldRemovalReplacement(input.text);
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
      trigger: { type: "replacement", replacement: parsed.when },
    },
  };
}
