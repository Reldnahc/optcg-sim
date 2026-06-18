import type { Effect, EffectOption, Target } from "@optcg/types";

import { parseKeyword } from "../../../keywords/index.js";
import type {
  InstructionParseResult,
  PrimitiveEvidence,
} from "../../../types.js";
import {
  continuousDuration,
  continuousDurationEvidence,
  parseFieldEffectDuration,
  type ContinuousInstructionContext,
} from "../shared.js";
import { effectSequence } from "../../effect-builders.js";

export const parseKeywordGrantForTarget = ({
  target,
  targetEvidence,
  text,
  context,
}: {
  readonly target: Target;
  readonly targetEvidence: readonly PrimitiveEvidence[];
  readonly text: string;
  readonly context: ContinuousInstructionContext;
}): InstructionParseResult | undefined => {
  const choice = parseKeywordChoiceGrantForTarget({
    target,
    targetEvidence,
    text,
    context,
  });
  if (choice !== undefined) {
    return choice;
  }

  const keyword = parseKeyword({ text });
  if (keyword === undefined) {
    return undefined;
  }
  const explicitDuration =
    keyword.rest.length === 0
      ? undefined
      : parseFieldEffectDuration({ text: keyword.rest });
  if (keyword.rest.length > 0 && explicitDuration === undefined) {
    return undefined;
  }
  if (explicitDuration !== undefined && explicitDuration.rest.length > 0) {
    return undefined;
  }

  return {
    effect: {
      type: "giveKeyword",
      target,
      keyword: keyword.keyword,
      duration:
        explicitDuration?.duration ?? continuousDuration(context.condition),
    },
    evidence: [
      "instruction:giveKeyword",
      ...targetEvidence,
      ...keyword.evidence,
      ...(explicitDuration?.evidence ?? [
        continuousDurationEvidence(context.condition),
      ]),
    ],
    rest: "",
  };
};

const parseKeywordChoiceGrantForTarget = ({
  target,
  targetEvidence,
  text,
  context,
}: {
  readonly target: Target;
  readonly targetEvidence: readonly PrimitiveEvidence[];
  readonly text: string;
  readonly context: ContinuousInstructionContext;
}): InstructionParseResult | undefined => {
  const parsed = parseInlineKeywordAlternatives(text);
  if (parsed === undefined) {
    return undefined;
  }

  const explicitDuration =
    parsed.rest.length === 0
      ? undefined
      : parseFieldEffectDuration({ text: parsed.rest });
  if (parsed.rest.length > 0 && explicitDuration === undefined) {
    return undefined;
  }
  if (explicitDuration !== undefined && explicitDuration.rest.length > 0) {
    return undefined;
  }

  const duration =
    explicitDuration?.duration ?? continuousDuration(context.condition);
  const durationEvidence = explicitDuration?.evidence ?? [
    continuousDurationEvidence(context.condition),
  ];
  const options: EffectOption[] = parsed.keywords.map((keyword, index) => ({
    id: `choice:keyword:${String(index + 1)}`,
    label: keyword.printed,
    effect: {
      type: "giveKeyword",
      target,
      keyword: keyword.keyword,
      duration,
    },
  }));

  return {
    effect: {
      type: "choice",
      chooser: "self",
      min: 1,
      max: 1,
      options,
    },
    evidence: [
      "expression:choice",
      ...parsed.keywords.map(() => "choice:option" as const),
      "instruction:giveKeyword",
      ...targetEvidence,
      ...parsed.keywords.flatMap((keyword) => keyword.evidence),
      ...durationEvidence,
    ],
    rest: "",
  };
};

interface InlineKeywordAlternative {
  readonly printed: string;
  readonly keyword: NonNullable<ReturnType<typeof parseKeyword>>["keyword"];
  readonly evidence: readonly PrimitiveEvidence[];
}

function parseInlineKeywordAlternatives(text: string):
  | {
      readonly keywords: readonly InlineKeywordAlternative[];
      readonly rest: string;
    }
  | undefined {
  const matches = [...text.matchAll(/\[[^\]]+\]/gu)];
  if (matches.length < 2) {
    return undefined;
  }

  const keywords: InlineKeywordAlternative[] = [];
  let cursor = 0;
  let sawOrSeparator = false;
  for (const match of matches) {
    const printed = match[0];
    const index = match.index;

    const separator = text.slice(cursor, index).trim();
    if (keywords.length === 0) {
      if (separator.length > 0) {
        return undefined;
      }
    } else if (!/^(?:,|or|,\s*or)$/iu.test(separator)) {
      return undefined;
    } else if (/\bor\b/iu.test(separator)) {
      sawOrSeparator = true;
    }

    const keyword = parseKeyword({ text: printed });
    if (keyword === undefined || keyword.rest.length > 0) {
      return undefined;
    }
    keywords.push({
      printed,
      keyword: keyword.keyword,
      evidence: keyword.evidence,
    });
    cursor = index + printed.length;
  }

  if (!sawOrSeparator) {
    return undefined;
  }

  return {
    keywords,
    rest: stripTerminalPeriod(text.slice(cursor).trim()),
  };
}

const stripTerminalPeriod = (text: string): string =>
  text === "." ? "" : text;

export const keywordSequence = (
  effects: readonly Effect[],
): Effect | undefined => effectSequence(effects);
