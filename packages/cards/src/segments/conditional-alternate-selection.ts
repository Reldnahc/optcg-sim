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

const conditionalAlternateInstructionPattern =
  /^(?<defaultText>.+?)\.\s+If (?<conditionText>.+?),\s+you may (?<alternateInstructionText>.+?) instead of (?<defaultReferenceText>.+?)\.?$/iu;

const conditionalAlternateChooseKoPattern =
  /^Choose up to (?<defaultCount>[1-9]\d*) of (?<defaultTargetText>.+?) and K\.O\. it\.\s+If (?<conditionText>.+?),\s+choose up to (?<alternateCount>[1-9]\d*) of (?<alternateTargetText>.+?) instead of .+\.?$/iu;

const koDefaultPattern = /^K\.O\.\s+up to (?<count>[1-9]\d*) of\s+.+$/iu;

type ConditionalAlternateParts = {
  readonly defaultInstructionText: string;
  readonly conditionText: string;
  readonly alternateInstructionText: string;
};

export const conditionalAlternateSelectionExpressionParser =
  (options: {
    readonly conditions: readonly ConditionParser[];
    readonly instructions: readonly InstructionParser[];
  }) =>
  (input: ParseInput): ExpressionParseResult | undefined => {
    const parts = parseConditionalAlternateParts(input.text.trim());
    if (parts === undefined) {
      return undefined;
    }

    const defaultEffect = parseInstruction(
      parts.defaultInstructionText,
      options.instructions,
    );
    const condition = parseConditionExpression(
      parts.conditionText.trim(),
      options.conditions,
    );
    if (defaultEffect === undefined || condition === undefined) {
      return undefined;
    }

    const alternateEffect = parseInstruction(
      parts.alternateInstructionText,
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

const parseConditionalAlternateParts = (
  text: string,
): ConditionalAlternateParts | undefined => {
  const chooseKo = conditionalAlternateChooseKoPattern.exec(text);
  const defaultCount = chooseKo?.groups?.["defaultCount"];
  const defaultTargetText = chooseKo?.groups?.["defaultTargetText"];
  const chooseKoConditionText = chooseKo?.groups?.["conditionText"];
  const alternateCount = chooseKo?.groups?.["alternateCount"];
  const chooseKoAlternateTargetText = chooseKo?.groups?.["alternateTargetText"];
  if (
    defaultCount !== undefined &&
    defaultTargetText !== undefined &&
    chooseKoConditionText !== undefined &&
    alternateCount !== undefined &&
    chooseKoAlternateTargetText !== undefined
  ) {
    return {
      defaultInstructionText: `K.O. up to ${defaultCount} of ${defaultTargetText.trim()}.`,
      conditionText: chooseKoConditionText,
      alternateInstructionText: `K.O. up to ${alternateCount} of ${chooseKoAlternateTargetText.trim()}.`,
    };
  }

  const instruction = conditionalAlternateInstructionPattern.exec(text);
  const instructionDefaultText = instruction?.groups?.["defaultText"];
  const instructionConditionText = instruction?.groups?.["conditionText"];
  const instructionAlternateText =
    instruction?.groups?.["alternateInstructionText"];
  const defaultReferenceText = instruction?.groups?.["defaultReferenceText"];
  if (
    instructionDefaultText !== undefined &&
    instructionConditionText !== undefined &&
    instructionAlternateText !== undefined &&
    defaultReferenceText !== undefined &&
    insteadReferenceMatchesDefault(instructionDefaultText, defaultReferenceText)
  ) {
    return {
      defaultInstructionText: instructionDefaultText,
      conditionText: instructionConditionText,
      alternateInstructionText: instructionAlternateText,
    };
  }

  const match = conditionalAlternateTargetPattern.exec(text);
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

  const alternateInstructionText = alternateKoInstructionText(
    defaultText,
    alternateTargetText,
  );
  if (alternateInstructionText === undefined) {
    return undefined;
  }

  return {
    defaultInstructionText: defaultText,
    conditionText,
    alternateInstructionText,
  };
};

const insteadReferenceMatchesDefault = (
  defaultText: string,
  referenceText: string,
): boolean => {
  const defaultDraw = /^draw (?<count>[1-9]\d*) cards?$/iu.exec(
    defaultText.trim(),
  );
  const referenceDraw = /^drawing (?<count>[1-9]\d*) cards?$/iu.exec(
    referenceText.trim(),
  );
  const defaultCount = defaultDraw?.groups?.["count"];
  return (
    defaultCount !== undefined &&
    referenceDraw?.groups?.["count"] === defaultCount
  );
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
