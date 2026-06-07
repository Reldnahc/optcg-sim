import type {
  Condition,
  Effect,
  EffectBlockCost,
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

interface ParsedChooseOneBody {
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

    let costPatch: EffectBlockCost | undefined;
    let conditionPatch: Condition | undefined;
    const evidence: PrimitiveEvidence[] = [
      "expression:choice",
      "composition:chooseOne",
      ...parsed.evidence,
    ];

    if (cost !== undefined) {
      costPatch = { ...cost.cost, optional: false };
      evidence.push(...cost.evidence);
    }

    if (parsed.condition !== undefined) {
      conditionPatch = parsed.condition.condition;
      evidence.push(...parsed.condition.evidence);
    }

    const choiceEffect: Effect = {
      type: "choice",
      chooser: "self",
      min: 1,
      max: 1,
      options: parsed.options,
    };
    const effect: Effect =
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
                effect: {
                  type: "custom",
                  handler: "unsupported:chooseOneThen",
                },
              },
            ],
          };

    if (parsed.trailingThen !== undefined) {
      evidence.push("connector:then", "expression:sequence");
    }

    return {
      effect,
      evidence,
      rest: "",
      blockPatch: {
        ...(costPatch === undefined ? {} : { cost: costPatch }),
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
    /^if (?<condition>.+?),\s*choose one:\s*(?<bullets>[\s\S]+)$/iu.exec(
      normalized,
    );
  const direct = /^choose one:\s*(?<bullets>[\s\S]+)$/iu.exec(normalized);

  const bulletText =
    conditional?.groups?.["bullets"] ?? direct?.groups?.["bullets"];
  if (bulletText === undefined) {
    return undefined;
  }

  const conditionText = conditional?.groups?.["condition"];
  const condition =
    conditionText === undefined
      ? undefined
      : parseCondition(conditionText, conditionParsers);
  if (conditionText !== undefined && condition === undefined) {
    return undefined;
  }

  const payload = parseChoicePayload(bulletText);
  if (payload === undefined || payload.labels.length < 2) {
    return undefined;
  }

  return {
    ...(condition === undefined ? {} : { condition }),
    options: payload.labels.map((label, index) => {
      const parsed = parseOptionEffect(label, expressionParsers);
      return {
        id: `choice:${String(index + 1)}`,
        label,
        effect: parsed?.effect ?? {
          type: "custom",
          handler: "unsupported:chooseOneOption",
        },
      };
    }),
    ...(payload.trailingThen === undefined
      ? {}
      : { trailingThen: payload.trailingThen }),
    evidence: payload.labels.map(() => "choice:option"),
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
    if (parsed !== undefined && parsed.rest.length === 0) {
      return parsed;
    }
  }
  return undefined;
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
  for (const parser of conditionParsers) {
    const parsed = parser({ text: conditionText });
    if (parsed !== undefined && parsed.rest.length === 0) {
      return {
        condition: parsed.condition,
        evidence: parsed.evidence,
      };
    }
  }
  return undefined;
}

function parseChoicePayload(
  text: string,
):
  | { readonly labels: readonly string[]; readonly trailingThen?: string }
  | undefined {
  const lines = text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const labels: string[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (line === undefined || !line.startsWith("\u2022")) {
      break;
    }
    const label = line.slice(1).trim();
    if (label.length === 0) {
      return undefined;
    }
    labels.push(label);
    index += 1;
  }

  const trailingLine = lines[index];
  if (trailingLine === undefined) {
    return { labels };
  }

  if (index === lines.length - 1 && /^then,/iu.test(trailingLine)) {
    return { labels, trailingThen: trailingLine };
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

  const optionLines = lines.filter((line) => line.text.startsWith("\u2022"));
  return [
    sourceSpan("span:choice", "choice", header, ["composition:chooseOne"]),
    ...optionLines.map((line, index) =>
      sourceSpan(`span:choice:${String(index)}:option`, "choiceOption", line, [
        "choice:option",
      ]),
    ),
  ];
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
