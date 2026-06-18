import type {
  Condition,
  Effect,
  EffectOption,
  EffectTextSpan,
} from "@optcg/types";

import { parseReturnDonCost } from "../costs/index.js";
import { sourceSpan, trimSource, type SourceSlice } from "../source-slices.js";
import type {
  ConditionParser,
  ExpressionParseResult,
  ParseInput,
  PrimitiveEvidence,
} from "../types.js";
import { parseConditionFromSet } from "../conditions/index.js";
import { parseBulletListPayload } from "./bullet-list.js";

interface ParsedChooseOneBody {
  readonly chooser: "self" | "opponent";
  readonly condition?: {
    readonly condition: Condition;
    readonly evidence: readonly PrimitiveEvidence[];
  };
  readonly options: EffectOption[];
  readonly trailingThen?: string;
  readonly evidence: readonly PrimitiveEvidence[];
  readonly presentationSpans?: readonly EffectTextSpan[];
}

export function chooseOneExpressionParser(options: {
  readonly conditions: readonly ConditionParser[];
  readonly expressions?: readonly ((
    input: ParseInput,
  ) => ExpressionParseResult | undefined)[];
}): (input: ParseInput) => ExpressionParseResult | undefined {
  return (input: ParseInput) => {
    const cost = parseReturnDonCost(input);
    const afterCost = cost?.rest ?? input.text.trim();
    const afterCostSource =
      cost?.restSource ??
      (input.source === undefined ? undefined : trimSource(input.source));
    const parsed = parseChooseOneBody(
      afterCost,
      options.conditions,
      options.expressions ?? [],
      afterCostSource,
    );
    if (parsed === undefined) {
      return undefined;
    }

    let conditionPatch: Condition | undefined;
    const evidence: PrimitiveEvidence[] = [
      "expression:choice",
      "composition:chooseOne",
      parsed.chooser === "opponent" ? "chooser:opponent" : "chooser:self",
      ...parsed.evidence,
    ];

    if (cost !== undefined) {
      evidence.push(...cost.evidence);
    }

    if (parsed.condition !== undefined) {
      conditionPatch = parsed.condition.condition;
      evidence.push(...parsed.condition.evidence);
    }
    const trailingThen =
      parsed.trailingThen === undefined
        ? undefined
        : parseTrailingThenEffect(
            parsed.trailingThen,
            options.expressions ?? [],
          );
    if (trailingThen !== undefined) {
      evidence.push(...trailingThen.evidence);
    }

    const choiceEffect: Effect = {
      type: "choice",
      chooser: parsed.chooser,
      min: 1,
      max: 1,
      options: parsed.options,
    };
    const choiceOrSequenceEffect: Effect =
      parsed.trailingThen === undefined
        ? choiceEffect
        : {
            type: "sequence",
            effects: [
              {
                id: "choice",
                connector: "always",
                effect: choiceEffect,
              },
              {
                id: "then",
                connector: "then",
                effect: trailingThen?.effect ?? {
                  type: "custom",
                  handler: "unsupported:chooseOneThen",
                },
              },
            ],
          };
    const effect: Effect =
      cost === undefined
        ? choiceOrSequenceEffect
        : {
            type: "sequence",
            effects: [
              {
                id: "cost:return-don",
                connector: "always",
                effect: {
                  type: "payCost",
                  cost: { ...cost.cost, optional: true },
                },
              },
              {
                id: "body:after-cost",
                connector: "ifYouDo",
                effect: choiceOrSequenceEffect,
              },
            ],
          };

    if (parsed.trailingThen !== undefined) {
      evidence.push("connector:then", "expression:sequence");
    }
    if (cost !== undefined) {
      evidence.push("composition:costedEffect", "expression:sequence");
    }

    return {
      effect,
      evidence,
      rest: "",
      blockPatch: {
        ...(conditionPatch === undefined ? {} : { condition: conditionPatch }),
      },
      presentationSpans: [
        ...(cost?.presentationSpans ?? []),
        ...(parsed.presentationSpans ?? []),
      ],
    };
  };
}

function parseChooseOneBody(
  text: string,
  conditionParsers: readonly ConditionParser[],
  expressionParsers: readonly ((
    input: ParseInput,
  ) => ExpressionParseResult | undefined)[],
  source?: SourceSlice,
): ParsedChooseOneBody | undefined {
  const normalized = text.trim();
  const conditional =
    /^if (?<condition>.+?),\s*(?<chooser>your opponent )?chooses? one:\s*(?<bullets>[\s\S]+)$/iu.exec(
      normalized,
    );
  const direct =
    /^(?<chooser>your opponent )?chooses? one:\s*(?<bullets>[\s\S]+)$/iu.exec(
      normalized,
    );

  const bulletText =
    conditional?.groups?.["bullets"] ?? direct?.groups?.["bullets"];
  if (bulletText === undefined) {
    return undefined;
  }

  const conditionText = conditional?.groups?.["condition"];
  const chooser =
    (conditional?.groups?.["chooser"] ?? direct?.groups?.["chooser"]) ===
    undefined
      ? "self"
      : "opponent";
  const condition =
    conditionText === undefined
      ? undefined
      : parseCondition(conditionText, conditionParsers);
  if (conditionText !== undefined && condition === undefined) {
    return undefined;
  }

  const payload = parseBulletListPayload(bulletText);
  if (payload === undefined || payload.items.length < 2) {
    return undefined;
  }

  const parsedOptions = payload.items.map((item, index) => {
    const parsed = parseOptionEffect(item, expressionParsers);
    return {
      option: {
        id: `choice:${String(index + 1)}`,
        label: item,
        effect: parsed?.effect ?? {
          type: "custom" as const,
          handler: "unsupported:chooseOneOption",
        },
      },
      evidence: parsed?.evidence ?? [],
    };
  });

  return {
    chooser,
    ...(condition === undefined ? {} : { condition }),
    options: parsedOptions.map((option) => option.option),
    ...(payload.trailingThen === undefined
      ? {}
      : { trailingThen: payload.trailingThen }),
    evidence: parsedOptions.flatMap((option) => [
      "choice:option" as const,
      ...option.evidence,
    ]),
    presentationSpans: choicePresentationSpans(source),
  };
}

function parseOptionEffect(
  text: string,
  expressionParsers: readonly ((
    input: ParseInput,
  ) => ExpressionParseResult | undefined)[],
): ExpressionParseResult | undefined {
  for (const parser of expressionParsers) {
    const parsed = parser({ text });
    if (
      parsed !== undefined &&
      parsed.rest.length === 0 &&
      !isUnsupportedCustomEffect(parsed.effect)
    ) {
      return parsed;
    }
  }
  return undefined;
}

function parseTrailingThenEffect(
  text: string,
  expressionParsers: readonly ((
    input: ParseInput,
  ) => ExpressionParseResult | undefined)[],
): ExpressionParseResult | undefined {
  const body = text.replace(/^Then,\s*/iu, "").trim();
  return parseOptionEffect(body, expressionParsers);
}

function isUnsupportedCustomEffect(effect: Effect): boolean {
  return effect.type === "custom" && effect.handler.startsWith("unsupported:");
}

function parseCondition(
  text: string,
  conditionParsers: readonly ConditionParser[],
):
  | {
      readonly condition: Condition;
      readonly evidence: readonly PrimitiveEvidence[];
    }
  | undefined {
  const conditionText = text.replace(/\.$/u, "").trim();
  const parsed = parseConditionFromSet(
    { text: conditionText },
    conditionParsers,
  );
  if (parsed !== undefined) {
    return {
      condition: parsed.condition,
      evidence: parsed.evidence,
    };
  }
  return undefined;
}

function choicePresentationSpans(
  source: SourceSlice | undefined,
): readonly EffectTextSpan[] {
  if (source === undefined) {
    return [];
  }

  const lines = sourceLines(source);
  const header = lines[0];
  if (header === undefined) {
    return [];
  }

  const optionLines = lines.filter((line) => isChoiceBulletLine(line.text));
  return [
    sourceSpan("span:choice", "choice", header, ["composition:chooseOne"]),
    ...optionLines.flatMap(
      (line, index) =>
        [
          sourceSpan(
            `span:choice:${String(index)}:option`,
            "choiceOption",
            line,
            ["choice:option"],
          ),
          sourceSpan(
            `span:choice:${String(index)}:body`,
            "body",
            choiceOptionBodySource(line),
            ["choice:option"],
          ),
        ] satisfies EffectTextSpan[],
    ),
  ];
}

function choiceOptionBodySource(source: SourceSlice): SourceSlice {
  const bulletMatch = /^(?:\u2022|-)\s*/u.exec(source.rawText);
  if (bulletMatch === null) {
    return source;
  }
  const rawText = source.rawText.slice(bulletMatch[0].length);
  return {
    text: rawText,
    rawText,
    start: source.start + bulletMatch[0].length,
    end: source.end,
  };
}

function isChoiceBulletLine(text: string): boolean {
  return text.startsWith("\u2022") || text.startsWith("-");
}

function sourceLines(source: SourceSlice): readonly SourceSlice[] {
  const lines: SourceSlice[] = [];
  for (const match of source.rawText.matchAll(/[^\r\n]+/gu)) {
    const rawText = match[0];
    const trimmed = trimSource({
      text: rawText,
      rawText,
      start: source.start + match.index,
      end: source.start + match.index + rawText.length,
    });
    if (trimmed.text.length > 0) {
      lines.push(trimmed);
    }
  }
  return lines;
}
