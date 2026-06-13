import type { Effect } from "@optcg/types";

import { parseConditionExpression } from "./composed-expression.js";
import { syntheticInstructionSegmentParser } from "./synthetic.js";
import type {
  ConditionParser,
  ExpressionParseResult,
  InstructionParser,
  ParseInput,
  PrimitiveEvidence,
} from "../types.js";

const conditionalAlternateTargetPattern =
  /^(?<defaultText>.+?)\.\s+If (?<conditionText>.+?),\s+you may select (?<alternateTargetText>.+?) instead\.?$/iu;

const koDefaultPattern = /^K\.O\.\s+up to (?<count>[1-9]\d*) of\s+.+$/iu;

export const conditionalAlternateSelectionExpressionParser =
  (options: {
    readonly conditions: readonly ConditionParser[];
    readonly instructions: readonly InstructionParser[];
  }) =>
  (input: ParseInput): ExpressionParseResult | undefined => {
    const match = conditionalAlternateTargetPattern.exec(input.text.trim());
    const defaultText = match?.groups?.["defaultText"];
    const conditionText = match?.groups?.["conditionText"];
    const alternateTargetText = match?.groups?.["alternateTargetText"];
    if (
      defaultText === undefined ||
      conditionText === undefined ||
      alternateTargetText === undefined
    ) {
      return undefined;
    }

    const defaultEffect = parseInstruction(defaultText, options.instructions);
    const condition = parseConditionExpression(
      conditionText.trim(),
      options.conditions,
    );
    if (defaultEffect === undefined || condition === undefined) {
      return undefined;
    }

    const alternateInstructionText = alternateKoInstructionText(
      defaultText,
      alternateTargetText,
    );
    if (alternateInstructionText === undefined) {
      return undefined;
    }
    const alternateEffect = parseInstruction(
      alternateInstructionText,
      options.instructions,
    );
    if (alternateEffect === undefined) {
      return undefined;
    }

    return {
      effect: {
        type: "conditional",
        if: condition.condition,
        then: {
          type: "choice",
          chooser: "self",
          min: 1,
          max: 1,
          options: [
            {
              id: "choice:default",
              label: "Use the default target.",
              effect: defaultEffect.effect,
            },
            {
              id: "choice:alternate",
              label: "Use the alternate target.",
              effect: alternateEffect.effect,
            },
          ],
        },
        else: defaultEffect.effect,
      },
      evidence: [
        "expression:conditional",
        "composition:chooseOne",
        ...condition.evidence,
        ...defaultEffect.evidence,
        ...alternateEffect.evidence,
      ],
      rest: "",
    };
  };

const parseInstruction = (
  text: string,
  instructions: readonly InstructionParser[],
):
  | {
      readonly effect: Effect;
      readonly evidence: readonly PrimitiveEvidence[];
    }
  | undefined => {
  const parsed = syntheticInstructionSegmentParser(instructions)({
    text: text.trim(),
  });
  return parsed !== undefined
    ? { effect: parsed.effect, evidence: parsed.evidence }
    : undefined;
};

const alternateKoInstructionText = (
  defaultText: string,
  alternateTargetText: string,
): string | undefined => {
  const match = koDefaultPattern.exec(defaultText.trim());
  const count = match?.groups?.["count"];
  return count === undefined
    ? undefined
    : `K.O. up to ${count} of ${alternateTargetText.trim()}.`;
};
