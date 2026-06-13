import { parseExpression } from "../expression-parser.js";
import type {
  ConditionParseResult,
  ConditionParser,
  ConnectorParser,
  ExpressionParseResult,
  InstructionParser,
  ParseInput,
  SegmentParser,
} from "../types.js";
import { parseConditionFromSet } from "../conditions/index.js";
import { sourceSpan, trimSource, type SourceSlice } from "../source-slices.js";
import { syntheticInstructionSegmentParser } from "./synthetic.js";

const trailingFormatCharactersPattern = /[\u200B-\u200D\u2060\uFEFF]+$/u;

export function instructionExpressionSegmentParser(options: {
  readonly connectors: readonly ConnectorParser[];
  readonly instructions: readonly InstructionParser[];
}): SegmentParser {
  return (input: ParseInput) => {
    const result = parseExpression(input, {
      connectors: options.connectors,
      segments: [syntheticInstructionSegmentParser(options.instructions)],
    });

    if (result === undefined || result.rest.length > 0) {
      return undefined;
    }

    return {
      effect: result.effect,
      ...(result.saveResultAs === undefined
        ? {}
        : { saveResultAs: result.saveResultAs }),
      evidence: result.evidence,
    };
  };
}

export function delayedEndOfTurnSegmentParser(options: {
  readonly connectors: readonly ConnectorParser[];
  readonly instructions: readonly InstructionParser[];
}): SegmentParser {
  return (input: ParseInput) => {
    const match = /^at the end of this turn,\s*(?<body>[\s\S]+)$/iu.exec(
      input.text,
    );
    const bodyText = match?.groups?.["body"];
    if (bodyText === undefined) {
      return undefined;
    }

    const body = parseExpression(
      {
        text: bodyText,
      },
      {
        connectors: options.connectors,
        segments: [
          instructionExpressionSegmentParser(options),
          syntheticInstructionSegmentParser(options.instructions),
        ],
      },
    );
    if (body === undefined || body.rest.length > 0) {
      return undefined;
    }

    return {
      effect: {
        type: "delayed",
        timing: { type: "endOfTurn", turn: "current" },
        effect: body.effect,
      },
      evidence: ["duration:endOfTurn", "composition:delayed", ...body.evidence],
    };
  };
}

export function eventTimedDelayedSegmentParser(options: {
  readonly connectors: readonly ConnectorParser[];
  readonly instructions: readonly InstructionParser[];
}): SegmentParser {
  return (input: ParseInput) => {
    const match =
      /^If this (?<subject>Leader|Character) battles your opponent's (?<target>Leader|Character) during this turn,\s*(?<body>[\s\S]+)$/iu.exec(
        input.text,
      );
    const subject = match?.groups?.["subject"]?.toLowerCase();
    const target = match?.groups?.["target"]?.toLowerCase();
    const bodyText = match?.groups?.["body"];
    if (
      (subject !== "leader" && subject !== "character") ||
      (target !== "leader" && target !== "character") ||
      bodyText === undefined
    ) {
      return undefined;
    }

    const body = parseExpression(
      { text: bodyText },
      {
        connectors: options.connectors,
        segments: [
          instructionExpressionSegmentParser(options),
          syntheticInstructionSegmentParser(options.instructions),
        ],
      },
    );
    if (body === undefined || body.rest.length > 0) {
      return undefined;
    }

    return {
      effect: {
        type: "delayed",
        timing: {
          type: "event",
          trigger: {
            type: "attackDeclared",
            role: "attacker",
            player: "self",
            filter: {
              categories: [subject],
            },
            targetPlayer: "opponent",
            targetFilter: {
              categories: [target],
            },
          },
          expires: { type: "endOfTurn", turn: "current" },
        },
        effect: body.effect,
      },
      evidence: [
        "trigger:attackDeclared",
        "duration:thisTurn",
        "composition:delayed",
        ...body.evidence,
      ],
    };
  };
}

export function conditionalExpressionSegmentParser(options: {
  readonly conditions: readonly ConditionParser[];
  readonly connectors: readonly ConnectorParser[];
  readonly instructions: readonly InstructionParser[];
  readonly expressions?: readonly ((
    input: ParseInput,
  ) => ExpressionParseResult | undefined)[];
}): SegmentParser {
  return (input: ParseInput) => {
    const parsed = parseLeadingConditionalExpression(
      input.text,
      options.conditions,
    );
    if (parsed !== undefined) {
      const { condition, conditionText, thenText } = parsed;
      const sourceParts = splitLeadingConditionSource(
        input.source,
        input.text,
        conditionText,
        thenText,
      );
      const thenInput = {
        text: thenText,
        ...(sourceParts?.thenSource === undefined
          ? {}
          : { source: sourceParts.thenSource }),
      };
      for (const parser of options.expressions ?? []) {
        const parsed = parser(thenInput);
        if (parsed !== undefined && parsed.rest.length === 0) {
          return {
            effect: {
              type: "conditional",
              if: condition.condition,
              then: parsed.effect,
            },
            evidence: [
              "expression:conditional",
              ...condition.evidence,
              ...parsed.evidence,
            ],
            presentationSpans: [
              ...(sourceParts?.conditionSource === undefined
                ? []
                : [
                    sourceSpan(
                      "span:condition:resolution",
                      "condition",
                      sourceParts.conditionSource,
                      condition.evidence,
                    ),
                  ]),
              ...(parsed.presentationSpans ?? []),
            ],
          };
        }
      }
      const directThen = syntheticInstructionSegmentParser(
        options.instructions,
      )(thenInput);
      const then =
        directThen === undefined
          ? parseExpression(thenInput, {
              connectors: options.connectors,
              segments: [
                instructionExpressionSegmentParser({
                  connectors: options.connectors,
                  instructions: options.instructions,
                }),
                syntheticInstructionSegmentParser(options.instructions),
              ],
            })
          : {
              effect: directThen.effect,
              evidence: directThen.evidence,
              rest: "",
              ...(directThen.presentationSpans === undefined
                ? {}
                : { presentationSpans: directThen.presentationSpans }),
            };
      if (then === undefined || then.rest.length > 0) {
        return undefined;
      }

      return {
        effect: {
          type: "conditional",
          if: condition.condition,
          then: then.effect,
        },
        evidence: [
          "expression:conditional",
          ...condition.evidence,
          ...then.evidence,
        ],
        presentationSpans: [
          ...(sourceParts?.conditionSource === undefined
            ? []
            : [
                sourceSpan(
                  "span:condition:resolution",
                  "condition",
                  sourceParts.conditionSource,
                  condition.evidence,
                ),
              ]),
          ...(then.presentationSpans ?? []),
        ],
      };
    }

    return undefined;
  };
}

export function trailingConditionalExpressionSegmentParser(options: {
  readonly conditions: readonly ConditionParser[];
  readonly connectors: readonly ConnectorParser[];
  readonly instructions: readonly InstructionParser[];
}): SegmentParser {
  return (input: ParseInput) => {
    const match = /^(?<then>.+?)\s+if (?<condition>.+)$/i.exec(input.text);
    const conditionText = match?.groups?.["condition"];
    const thenText = match?.groups?.["then"];
    if (conditionText === undefined || thenText === undefined) {
      return undefined;
    }

    const condition = parseConditionExpression(
      conditionText.replace(/\.$/u, "").trim(),
      options.conditions,
    );
    if (condition === undefined) {
      return undefined;
    }

    const sourceParts = splitTrailingConditionSource(
      input.source,
      input.text,
      thenText,
      conditionText,
    );
    const then = parseExpression(
      {
        text: thenText,
        ...(sourceParts?.thenSource === undefined
          ? {}
          : { source: sourceParts.thenSource }),
      },
      {
        connectors: options.connectors,
        segments: [
          instructionExpressionSegmentParser({
            connectors: options.connectors,
            instructions: options.instructions,
          }),
          syntheticInstructionSegmentParser(options.instructions),
        ],
      },
    );
    if (then === undefined || then.rest.length > 0) {
      return undefined;
    }

    return {
      effect: {
        type: "conditional",
        if: condition.condition,
        then: then.effect,
      },
      evidence: [
        "expression:conditional",
        ...condition.evidence,
        ...then.evidence,
      ],
      presentationSpans: [
        ...(sourceParts?.conditionSource === undefined
          ? []
          : [
              sourceSpan(
                "span:condition:resolution",
                "condition",
                sourceParts.conditionSource,
                condition.evidence,
              ),
            ]),
        ...(then.presentationSpans ?? []),
      ],
    };
  };
}

export function conditionalBlockExpressionParser(options: {
  readonly conditions: readonly ConditionParser[];
  readonly connectors: readonly ConnectorParser[];
  readonly instructions: readonly InstructionParser[];
  readonly expressions?: readonly ((
    input: ParseInput,
  ) => ExpressionParseResult | undefined)[];
}): (input: ParseInput) => ExpressionParseResult | undefined {
  return (input: ParseInput) => {
    const parsed = parseLeadingConditionalExpression(
      input.text,
      options.conditions,
    );
    if (parsed !== undefined) {
      const { condition, conditionText, thenText } = parsed;
      const sourceParts = splitLeadingConditionSource(
        input.source,
        input.text,
        conditionText,
        thenText,
      );
      for (const parser of options.expressions ?? []) {
        const parsed = parser({
          text: thenText,
          ...(sourceParts?.thenSource === undefined
            ? {}
            : { source: sourceParts.thenSource }),
        });
        if (parsed !== undefined && parsed.rest.length === 0) {
          return {
            effect: parsed.effect,
            evidence: [
              "expression:conditional",
              ...condition.evidence,
              ...parsed.evidence,
            ],
            rest: "",
            blockPatch: {
              condition: condition.condition,
            },
            presentationSpans: [
              ...(sourceParts?.conditionSource === undefined
                ? []
                : [
                    sourceSpan(
                      "span:condition:resolution",
                      "condition",
                      sourceParts.conditionSource,
                      condition.evidence,
                    ),
                  ]),
              ...(parsed.presentationSpans ?? []),
            ],
          };
        }
      }
      const expressionSegments: SegmentParser[] = (
        options.expressions ?? []
      ).map(
        (parser): SegmentParser =>
          (segmentInput) => {
            const parsed = parser(segmentInput);
            if (parsed === undefined || parsed.rest.length > 0) {
              return undefined;
            }
            return { effect: parsed.effect, evidence: parsed.evidence };
          },
      );
      const then = parseExpression(
        {
          text: thenText,
          ...(sourceParts?.thenSource === undefined
            ? {}
            : { source: sourceParts.thenSource }),
        },
        {
          connectors: options.connectors,
          segments: [
            ...expressionSegments,
            instructionExpressionSegmentParser({
              connectors: options.connectors,
              instructions: options.instructions,
            }),
            syntheticInstructionSegmentParser(options.instructions),
          ],
        },
      );
      if (then === undefined || then.rest.length > 0) {
        return undefined;
      }

      return {
        effect: then.effect,
        evidence: [
          "expression:conditional",
          ...condition.evidence,
          ...then.evidence,
        ],
        rest: "",
        blockPatch: {
          condition: condition.condition,
        },
        presentationSpans: [
          ...(sourceParts?.conditionSource === undefined
            ? []
            : [
                sourceSpan(
                  "span:condition:resolution",
                  "condition",
                  sourceParts.conditionSource,
                  condition.evidence,
                ),
              ]),
          ...(then.presentationSpans ?? []),
        ],
      };
    }

    return undefined;
  };
}

export function conditionalCostedBlockExpressionParser(options: {
  readonly conditions: readonly ConditionParser[];
  readonly expressions: readonly ((
    input: ParseInput,
  ) => ExpressionParseResult | undefined)[];
}): (input: ParseInput) => ExpressionParseResult | undefined {
  return (input: ParseInput) => {
    const parsed = parseLeadingConditionalExpression(
      input.text,
      options.conditions,
    );
    if (parsed !== undefined) {
      const { condition, conditionText, thenText } = parsed;
      const sourceParts = splitLeadingConditionSource(
        input.source,
        input.text,
        conditionText,
        thenText,
      );
      for (const expressionParser of options.expressions) {
        const then = expressionParser({
          text: thenText,
          ...(sourceParts?.thenSource === undefined
            ? {}
            : { source: sourceParts.thenSource }),
        });
        if (then === undefined || then.rest.length > 0) {
          continue;
        }

        return {
          effect: then.effect,
          evidence: [
            "expression:conditional",
            "composition:conditionalCostedEffect",
            ...condition.evidence,
            ...then.evidence,
          ],
          rest: "",
          blockPatch: {
            condition: condition.condition,
          },
          presentationSpans: [
            ...(sourceParts?.conditionSource === undefined
              ? []
              : [
                  sourceSpan(
                    "span:condition:resolution",
                    "condition",
                    sourceParts.conditionSource,
                    condition.evidence,
                  ),
                ]),
            ...(then.presentationSpans ?? []),
          ],
        };
      }
    }

    return undefined;
  };
}

export function parseConditionExpression(
  text: string,
  conditionParsers: readonly ConditionParser[],
): ConditionParseResult | undefined {
  const direct = parseSingleCondition(text, conditionParsers);
  if (direct !== undefined) {
    return direct;
  }

  const disjunctionParts = expandSharedLeaderSubjectDisjunction(
    splitConditionDisjunction(text)
      .map((part) => part.trim())
      .filter((part) => part.length > 0),
  );
  if (disjunctionParts.length >= 2) {
    const parsedParts: ConditionParseResult[] = [];
    let allPartsParsed = true;
    for (const part of disjunctionParts) {
      const parsed = parseSingleCondition(part, conditionParsers);
      if (parsed === undefined) {
        allPartsParsed = false;
        break;
      }
      parsedParts.push(parsed);
    }

    if (allPartsParsed) {
      return {
        condition: {
          type: "or",
          conditions: parsedParts.map((part) => part.condition),
        },
        evidence: [
          "composition:conditionOr",
          ...parsedParts.flatMap((part) => part.evidence),
        ],
        rest: "",
      };
    }
  }

  const parts = splitConditionConjunction(text)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length < 2) {
    return undefined;
  }

  const parsedParts: ConditionParseResult[] = [];
  for (const part of parts) {
    const parsed = parseSingleCondition(part, conditionParsers);
    if (parsed === undefined) {
      return undefined;
    }
    parsedParts.push(parsed);
  }

  return {
    condition: {
      type: "and",
      conditions: parsedParts.map((part) => part.condition),
    },
    evidence: [
      "composition:conditionAnd",
      ...parsedParts.flatMap((part) => part.evidence),
    ],
    rest: "",
  };
}

function splitConditionDisjunction(text: string): string[] {
  const protectedSubject = "__condition_subject_your_or_opponents__";
  return text
    .replace(/\byour or your opponent's\b/giu, protectedSubject)
    .split(/\s+or\s+/iu)
    .map((part) =>
      part.replace(
        new RegExp(protectedSubject, "gu"),
        "your or your opponent's",
      ),
    );
}

function splitConditionConjunction(text: string): string[] {
  const protectedSubject = "__condition_subject_you_and_your_opponent__";
  const parts = text
    .replace(/\byou and your opponent\b/giu, protectedSubject)
    .split(/\s+and\s+|,\s+(?=(?:you|your|your opponent|the number)\b)/iu)
    .map((part) =>
      part
        .replace(new RegExp(protectedSubject, "gu"), "you and your opponent")
        .replace(/,$/u, "")
        .trim(),
    );
  return expandSharedCountSubjectConjunction(parts);
}

function expandSharedCountSubjectConjunction(
  parts: readonly string[],
): string[] {
  const first = parts[0];
  if (first === undefined || parts.length < 2) {
    return [...parts];
  }

  const subjectMatch =
    /^(?<subject>you|your opponent) (?<verb>have|has)\s+.+$/iu.exec(first);
  const subject = subjectMatch?.groups?.["subject"];
  const verb = subjectMatch?.groups?.["verb"];
  if (subject === undefined || verb === undefined) {
    return [...parts];
  }

  return parts.map((part, index) => {
    if (
      index === 0 ||
      /^(?:you|your opponent) (?:have|has)\b/iu.test(part) ||
      !/^[1-9]\d*\s+or\s+(?:more|less)\s+cards?\b/iu.test(part)
    ) {
      return part;
    }
    return `${subject} ${verb} ${part}`;
  });
}

function expandSharedLeaderSubjectDisjunction(
  parts: readonly string[],
): readonly string[] {
  const first = parts[0];
  if (first === undefined || parts.length < 2) {
    return parts;
  }
  const match =
    /^(?<subject>(?:your|your opponent's) Leader (?:is|has(?: the)?))\s+.+$/iu.exec(
      first,
    );
  const subject = match?.groups?.["subject"];
  if (subject === undefined) {
    return parts;
  }

  return parts.map((part, index) =>
    index === 0 || /\bLeader\b/iu.test(part) ? part : `${subject} ${part}`,
  );
}

export function parseLeadingConditionalExpression(
  text: string,
  conditionParsers: readonly ConditionParser[],
):
  | {
      readonly condition: ConditionParseResult;
      readonly conditionText: string;
      readonly thenText: string;
    }
  | undefined {
  const ifMatch = /^if\s+(?<rest>.+)$/iu.exec(text.trim());
  const rest = ifMatch?.groups?.["rest"];
  if (rest === undefined) {
    return undefined;
  }

  const commaIndexes = [...rest.matchAll(/,/gu)].map((match) => match.index);
  for (const commaIndex of commaIndexes.reverse()) {
    const conditionText = rest
      .slice(0, commaIndex)
      .replace(trailingFormatCharactersPattern, "")
      .replace(/\.$/u, "")
      .trim();
    const thenText = rest.slice(commaIndex + 1).trim();
    if (conditionText.length === 0 || thenText.length === 0) {
      continue;
    }
    const condition = parseConditionExpression(conditionText, conditionParsers);
    if (condition !== undefined) {
      return { condition, conditionText, thenText };
    }
  }

  return undefined;
}

function parseSingleCondition(
  text: string,
  conditionParsers: readonly ConditionParser[],
): ConditionParseResult | undefined {
  return parseConditionFromSet({ text }, conditionParsers);
}

function splitLeadingConditionSource(
  source: SourceSlice | undefined,
  text: string,
  conditionText: string,
  thenText: string,
):
  | {
      readonly conditionSource: SourceSlice;
      readonly thenSource: SourceSlice;
    }
  | undefined {
  if (source === undefined) {
    return undefined;
  }
  const conditionStart = text.indexOf(conditionText);
  const thenStart = text.indexOf(thenText, Math.max(0, conditionStart));
  if (conditionStart < 0 || thenStart < 0) {
    return undefined;
  }
  return {
    conditionSource: trimSource({
      text: conditionText,
      rawText: conditionText,
      start: source.start + conditionStart,
      end: source.start + conditionStart + conditionText.length,
    }),
    thenSource: trimSource({
      text: thenText,
      rawText: thenText,
      start: source.start + thenStart,
      end: source.start + thenStart + thenText.length,
    }),
  };
}

function splitTrailingConditionSource(
  source: SourceSlice | undefined,
  text: string,
  thenText: string,
  conditionText: string,
):
  | {
      readonly thenSource: SourceSlice;
      readonly conditionSource: SourceSlice;
    }
  | undefined {
  if (source === undefined) {
    return undefined;
  }

  const thenStart = text.indexOf(thenText);
  const conditionStart = text.lastIndexOf(conditionText);
  if (thenStart < 0 || conditionStart < 0) {
    return undefined;
  }

  const cleanConditionText = conditionText.replace(/\.$/u, "").trim();
  const conditionTrimOffset = conditionText.indexOf(cleanConditionText);
  const conditionStartOffset = Math.max(0, conditionTrimOffset);

  return {
    thenSource: trimSource({
      text: thenText,
      rawText: thenText,
      start: source.start + thenStart,
      end: source.start + thenStart + thenText.length,
    }),
    conditionSource: trimSource({
      text: cleanConditionText,
      rawText: cleanConditionText,
      start: source.start + conditionStart + conditionStartOffset,
      end:
        source.start +
        conditionStart +
        conditionStartOffset +
        cleanConditionText.length,
    }),
  };
}
