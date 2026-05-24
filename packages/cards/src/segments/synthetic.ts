import type {
  ConditionParser,
  InstructionParser,
  ParseInput,
  SegmentParser,
} from "../types.js";

export function syntheticInstructionSegmentParser(
  instructions: readonly InstructionParser[],
): SegmentParser {
  return (input: ParseInput) => {
    for (const instruction of instructions) {
      const result = instruction(input);
      if (result !== undefined && result.rest.length === 0) {
        return {
          effect: result.effect,
          evidence: result.evidence,
        };
      }
    }

    return undefined;
  };
}

export function syntheticConditionalSegmentParser(options: {
  readonly conditions: readonly ConditionParser[];
  readonly instructions: readonly InstructionParser[];
}): SegmentParser {
  return (input: ParseInput) => {
    const match = /^if (?<condition>.+), (?<then>.+)$/i.exec(input.text);
    const groups = match?.groups;
    if (groups === undefined) {
      return undefined;
    }

    const conditionText = groups["condition"];
    const thenText = groups["then"];
    if (conditionText === undefined || thenText === undefined) {
      return undefined;
    }

    for (const conditionParser of options.conditions) {
      const condition = conditionParser({ text: conditionText });
      if (condition === undefined || condition.rest.length > 0) {
        continue;
      }

      const instruction = syntheticInstructionSegmentParser(
        options.instructions,
      )({
        text: thenText,
      });
      if (instruction === undefined) {
        continue;
      }

      return {
        effect: {
          type: "conditional",
          if: condition.condition,
          then: instruction.effect,
        },
        evidence: [
          "expression:conditional",
          ...condition.evidence,
          ...instruction.evidence,
        ],
      };
    }

    return undefined;
  };
}
