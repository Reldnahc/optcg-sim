import type { Effect, EffectTextSpan } from "@optcg/types";

import { parseExpression } from "../expression-parser.js";
import type {
  ExpressionParseResult,
  InstructionParser,
  ParseInput,
  SegmentParser,
} from "../types.js";
import { trimSource, type SourceSlice } from "../source-slices.js";
import { syntheticInstructionSegmentParser } from "./synthetic.js";

type SequencedChildEffect = Extract<
  Effect,
  { type: "sequence" }
>["effects"][number]["effect"];

export function optionalActionEffectSegmentParser(options: {
  readonly instructions: readonly InstructionParser[];
  readonly expressions?: readonly ((
    input: ParseInput,
  ) => ExpressionParseResult | undefined)[];
}): SegmentParser {
  return (input) => {
    const standalone = parseStandaloneOptionalAction(input, options);
    if (standalone !== undefined) {
      return standalone;
    }

    const explicitOptional = parseIfYouDoContinuation(
      input,
      options,
      /^you may\s+(?<action>.+?)\.\s+If you do,\s+(?<body>.+)$/iu,
      true,
    );
    if (explicitOptional !== undefined) {
      return explicitOptional;
    }

    return parseIfYouDoContinuation(
      input,
      options,
      /^(?<action>.+?)\.\s+If you do,\s+(?<body>.+)$/iu,
      false,
    );
  };
}

function parseIfYouDoContinuation(
  input: ParseInput,
  options: {
    readonly instructions: readonly InstructionParser[];
    readonly expressions?: readonly ((
      input: ParseInput,
    ) => ExpressionParseResult | undefined)[];
  },
  pattern: RegExp,
  forceActionOptional: boolean,
): ReturnType<SegmentParser> {
  const match = pattern.exec(input.text);
  const actionText = match?.groups?.["action"];
  const bodyText = match?.groups?.["body"];
  if (actionText === undefined || bodyText === undefined) {
    return undefined;
  }

  const action = parseOptionalActionChild(
    actionText,
    options,
    childSourceForText(input.source, input.text, actionText),
  );
  const body = parseOptionalActionChild(
    bodyText,
    options,
    childSourceForText(input.source, input.text, bodyText),
  );
  if (
    action === undefined ||
    body === undefined ||
    (!forceActionOptional && !canDriveIfYouDoContinuation(action.effect))
  ) {
    return undefined;
  }

  return {
    effect: {
      type: "sequence",
      effects: [
        {
          id: "optional-action",
          connector: "always",
          ...(forceActionOptional ? { optional: true as const } : {}),
          effect: action.effect,
        },
        {
          id: "body:after-optional-action",
          connector: "ifYouDo",
          effect: body.effect,
        },
      ],
    },
    evidence: [
      forceActionOptional
        ? "composition:optionalActionEffect"
        : "composition:ifYouDoContinuation",
      ...action.evidence,
      ...body.evidence,
    ],
    ...(action.presentationSpans === undefined &&
    body.presentationSpans === undefined
      ? {}
      : {
          presentationSpans: [
            ...scopeDuplicateSpanIds([
              ...(action.presentationSpans ?? []),
              ...(body.presentationSpans ?? []),
            ]),
          ],
        }),
  };
}

function canDriveIfYouDoContinuation(effect: SequencedChildEffect): boolean {
  if (effect.type !== "sequence") {
    return false;
  }
  return effect.effects.some((segment) => {
    if (segment.optional === true || segment.connector === "ifPossible") {
      return true;
    }
    return canDriveIfYouDoContinuation(segment.effect);
  });
}

function parseStandaloneOptionalAction(
  input: ParseInput,
  options: {
    readonly instructions: readonly InstructionParser[];
    readonly expressions?: readonly ((
      input: ParseInput,
    ) => ExpressionParseResult | undefined)[];
  },
): ReturnType<SegmentParser> {
  const match = /^you may\s+(?<action>.+)$/iu.exec(input.text);
  const actionText = match?.groups?.["action"]?.trim();
  if (actionText === undefined || actionText.length === 0) {
    return undefined;
  }

  const action = parseOptionalActionChild(actionText, options, input.source);
  if (action === undefined) {
    return undefined;
  }

  return {
    effect: {
      type: "sequence",
      effects: [
        {
          id: "optional-action",
          connector: "always",
          optional: true,
          effect: action.effect,
        },
      ],
    },
    evidence: ["composition:optionalActionEffect", ...action.evidence],
    ...(action.presentationSpans === undefined
      ? {}
      : { presentationSpans: action.presentationSpans }),
  };
}

function parseOptionalActionChild(
  text: string,
  options: {
    readonly instructions: readonly InstructionParser[];
    readonly expressions?: readonly ((
      input: ParseInput,
    ) => ExpressionParseResult | undefined)[];
  },
  source?: SourceSlice,
): ExpressionParseResult | undefined {
  for (const expression of options.expressions ?? []) {
    const parsed = expression({
      text,
      ...(source === undefined ? {} : { source }),
    });
    if (parsed !== undefined && parsed.rest.length === 0) {
      return parsed;
    }
  }

  return parseExpression(
    {
      text,
      ...(source === undefined ? {} : { source }),
    },
    {
      connectors: [],
      segments: [syntheticInstructionSegmentParser(options.instructions)],
    },
  );
}

const childSourceForText = (
  source: SourceSlice | undefined,
  parentText: string,
  childText: string,
): SourceSlice | undefined => {
  if (source === undefined) {
    return undefined;
  }
  const startIndex = parentText.indexOf(childText);
  if (startIndex < 0) {
    return undefined;
  }
  return trimSource({
    text: childText,
    rawText: source.rawText.slice(startIndex, startIndex + childText.length),
    start: source.start + startIndex,
    end: source.start + startIndex + childText.length,
  });
};

const scopeDuplicateSpanIds = (
  spans: readonly EffectTextSpan[],
): readonly EffectTextSpan[] => {
  const countsById = new Map<EffectTextSpan["id"], number>();
  return spans.map((span) => {
    const count = (countsById.get(span.id) ?? 0) + 1;
    countsById.set(span.id, count);
    return count === 1
      ? span
      : {
          ...span,
          id: `${span.id}:${String(count)}`,
        };
  });
};
