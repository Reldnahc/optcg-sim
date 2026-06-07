import type {
  EffectTextSpan,
  EffectTextSpanId,
  EffectTextSpanRole,
} from "@optcg/types";

import type { PrimitiveEvidence } from "./types.js";

export interface SourceSlice {
  readonly text: string;
  readonly rawText: string;
  readonly start: number;
  readonly end: number;
}

export interface SourceDelimiter {
  readonly id: string;
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

export const createSourceSlice = (text: string): SourceSlice => ({
  text,
  rawText: text,
  start: 0,
  end: text.length,
});

export const trimSource = (source: SourceSlice): SourceSlice => {
  const leading = /^\s*/u.exec(source.rawText)?.[0].length ?? 0;
  const trailing = /\s*$/u.exec(source.rawText)?.[0].length ?? 0;
  const rawText = source.rawText.slice(
    leading,
    source.rawText.length - trailing,
  );

  return {
    text: rawText,
    rawText,
    start: source.start + leading,
    end: source.end - trailing,
  };
};

export const consumeSourcePrefix = (
  source: SourceSlice,
  prefix: string,
):
  | { readonly consumed: SourceSlice; readonly rest: SourceSlice }
  | undefined => {
  const trimmed = trimSource(source);
  if (!trimmed.rawText.startsWith(prefix)) {
    return undefined;
  }

  const consumedRaw = trimmed.rawText.slice(0, prefix.length);
  const restRaw = trimmed.rawText.slice(prefix.length);

  return {
    consumed: {
      text: consumedRaw.trim(),
      rawText: consumedRaw,
      start: trimmed.start,
      end: trimmed.start + consumedRaw.length,
    },
    rest: trimSource({
      text: restRaw,
      rawText: restRaw,
      start: trimmed.start + prefix.length,
      end: trimmed.end,
    }),
  };
};

export const splitSourceByDelimiter = (
  source: SourceSlice,
  pattern: RegExp,
  delimiterId: string,
):
  | {
      readonly segments: readonly SourceSlice[];
      readonly delimiters: readonly SourceDelimiter[];
    }
  | undefined => {
  const flags = pattern.flags.includes("g")
    ? pattern.flags
    : `${pattern.flags}g`;
  const regex = new RegExp(pattern.source, flags);
  const segments: SourceSlice[] = [];
  const delimiters: SourceDelimiter[] = [];
  let lastIndex = 0;

  for (const match of source.rawText.matchAll(regex)) {
    const index = match.index;
    const delimiterRaw = match[0];
    if (delimiterRaw.length === 0) {
      continue;
    }

    const segmentRaw = source.rawText.slice(lastIndex, index);
    const segment = trimSource({
      text: segmentRaw,
      rawText: segmentRaw,
      start: source.start + lastIndex,
      end: source.start + index,
    });
    if (segment.text.length > 0) {
      segments.push(segment);
    }

    const delimiterTrimmed = trimSource({
      text: delimiterRaw,
      rawText: delimiterRaw,
      start: source.start + index,
      end: source.start + index + delimiterRaw.length,
    });
    delimiters.push({
      id: delimiterId,
      text: delimiterTrimmed.text,
      start: delimiterTrimmed.start,
      end: delimiterTrimmed.end,
    });
    lastIndex = index + delimiterRaw.length;
  }

  const finalRaw = source.rawText.slice(lastIndex);
  const finalSegment = trimSource({
    text: finalRaw,
    rawText: finalRaw,
    start: source.start + lastIndex,
    end: source.end,
  });
  if (finalSegment.text.length > 0) {
    segments.push(finalSegment);
  }

  return segments.length > 1 ? { segments, delimiters } : undefined;
};

export const sourceSpan = (
  id: EffectTextSpanId,
  role: EffectTextSpanRole,
  source: SourceSlice,
  primitiveEvidence?: readonly PrimitiveEvidence[],
): EffectTextSpan => ({
  id,
  role,
  start: source.start,
  end: source.end,
  text: source.rawText,
  ...(primitiveEvidence === undefined || primitiveEvidence.length === 0
    ? {}
    : { primitiveEvidence }),
});
