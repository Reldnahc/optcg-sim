import { parseExpression } from "../expression-parser.js";
import type {
  ExpressionParseResult,
  InstructionParser,
  ParseInput,
  SegmentParser,
} from "../types.js";
import type { SourceSlice } from "../source-slices.js";
import { syntheticInstructionSegmentParser } from "./synthetic.js";

export function optionalActionEffectSegmentParser(options: {
  readonly instructions: readonly InstructionParser[];
  readonly expressions?: readonly ((
    input: ParseInput,
  ) => ExpressionParseResult | undefined)[];
}): SegmentParser {
  return (input) => {
    const match =
      /^you may\s+(?<action>.+?)\.\s+If you do,\s+(?<body>.+)$/iu.exec(
        input.text,
      );
    const actionText = match?.groups?.["action"];
    const bodyText = match?.groups?.["body"];
    if (actionText === undefined || bodyText === undefined) {
      return undefined;
    }

    const action = parseOptionalActionChild(actionText, options, input.source);
    const body = parseOptionalActionChild(bodyText, options, input.source);
    if (action === undefined || body === undefined) {
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
          {
            id: "body:after-optional-action",
            connector: "ifYouDo",
            effect: body.effect,
          },
        ],
      },
      evidence: [
        "composition:optionalActionEffect",
        ...action.evidence,
        ...body.evidence,
      ],
      ...(action.presentationSpans === undefined &&
      body.presentationSpans === undefined
        ? {}
        : {
            presentationSpans: [
              ...(action.presentationSpans ?? []),
              ...(body.presentationSpans ?? []),
            ],
          }),
    };
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
