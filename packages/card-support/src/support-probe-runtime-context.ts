import type { EffectBlock } from "@optcg/types";
import {
  parseCardEffectLinesDetailed,
  type ParsedRuntimeEffectLine,
} from "@optcg/cards";

export interface SupportProbeRuntimeContext {
  readonly siblingBlocks: readonly EffectBlock[];
}

export const runtimeBlocksForValues = (
  values: readonly ParsedRuntimeEffectLine[],
  effectId: string,
): readonly EffectBlock[] =>
  values.map((value, index) => ({
    ...value.block,
    id:
      values.length === 1
        ? (effectId as EffectBlock["id"])
        : (`${effectId}:${String(index + 1)}` as EffectBlock["id"]),
  }));

export const runtimeContextForEffectLines = (
  lines: readonly string[],
  effectIdForLine: (lineNumber: number) => string,
): SupportProbeRuntimeContext => {
  const siblingBlocks: EffectBlock[] = [];
  for (const [index, text] of lines.entries()) {
    const parsed = parseCardEffectLinesDetailed(text);
    if (!parsed.ok) {
      continue;
    }
    const values = parsed.value.filter(
      (value): value is ParsedRuntimeEffectLine => value.kind !== "metadata",
    );
    siblingBlocks.push(
      ...runtimeBlocksForValues(values, effectIdForLine(index + 1)),
    );
  }
  return { siblingBlocks };
};
