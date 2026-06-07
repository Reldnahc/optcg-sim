import { evaluateEffectBlockRuntimeSupport } from "@optcg/engine-core";
import type {
  CardId,
  EffectBlock,
  EffectDefinition,
  EffectTextPresentationRef,
  EffectTextSourceMap,
} from "@optcg/types";

import { parseCardEffectLinesDetailed } from "../card-effect-line-parser.js";
import {
  presentationSpanScope,
  scopePresentationSpan,
} from "../presentation-span-ids.js";

interface EffectMaterializationVersions {
  readonly effectDefinitionsVersion: string;
  readonly rulesVersion: string;
}

export const materializeEffectDefinition = (
  cardId: CardId,
  lines: readonly string[],
  sourceTextHash: string,
  versions: EffectMaterializationVersions,
): {
  readonly definition?: EffectDefinition;
  readonly runtimeSupported: boolean;
  readonly diagnostics: readonly string[];
} => {
  const blocks: EffectBlock[] = [];
  const diagnostics: string[] = [];
  let parsedLineCount = 0;
  const shouldScopeSpanIds = lines.length > 1;

  for (const [index, line] of lines.entries()) {
    const parsed = parseCardEffectLinesDetailed(line);
    if (!parsed.ok) {
      diagnostics.push(
        `line ${String(index + 1)} parse failed: ${parsed.diagnostic.reason}`,
      );
      continue;
    }
    parsedLineCount += 1;
    const runtimeValues = parsed.value.filter(
      (
        value,
      ): value is Extract<
        (typeof parsed.value)[number],
        { readonly block: unknown }
      > => value.kind !== "metadata",
    );
    for (const [blockIndex, value] of runtimeValues.entries()) {
      const spanScope = presentationSpanScope({
        blockIndex,
        lineIndex: index,
        scoped: shouldScopeSpanIds || runtimeValues.length > 1,
      });
      const sourceMap =
        value.sourceMap === undefined
          ? undefined
          : {
              ...value.sourceMap,
              spans: value.sourceMap.spans.map((span) =>
                scopePresentationSpan(span, spanScope),
              ),
            };
      const presentation = presentationRefFromSourceMap(sourceMap);
      const block: EffectBlock = {
        ...value.block,
        id:
          runtimeValues.length === 1
            ? (`${String(cardId)}:generated:${String(index + 1)}` as EffectBlock["id"])
            : (`${String(cardId)}:generated:${String(index + 1)}:${String(
                blockIndex + 1,
              )}` as EffectBlock["id"]),
        ...(presentation === undefined ? {} : { presentation }),
      };
      const runtimeSupport = evaluateEffectBlockRuntimeSupport(block);
      if (!runtimeSupport.supported) {
        diagnostics.push(
          `line ${String(index + 1)} runtime unsupported: ${
            runtimeSupport.reason ?? "unknown reason"
          }`,
        );
      }
      blocks.push(block);
    }
  }

  if (lines.length === 0) {
    return { runtimeSupported: true, diagnostics };
  }
  const runtimeSupported =
    parsedLineCount === lines.length &&
    blocks.every((block) => evaluateEffectBlockRuntimeSupport(block).supported);
  if (!runtimeSupported) {
    return { runtimeSupported: false, diagnostics };
  }

  return {
    runtimeSupported: true,
    diagnostics,
    definition: {
      cardId,
      implementationStatus: "implemented-dsl",
      effects: blocks,
      metadata: {
        sourceTextHash,
        rulesVersion: versions.rulesVersion,
        effectDefinitionsVersion: versions.effectDefinitionsVersion,
        tested: true,
        generatedBy: "rule-parser",
        reviewedBy: "card-repository",
        reviewedAt: "2026-05-25T00:00:00.000Z",
        notes: "Generated from live Poneglyph primitive parser output.",
      },
    },
  };
};

const presentationRefFromSourceMap = (
  sourceMap: EffectTextSourceMap | undefined,
): EffectTextPresentationRef | undefined => {
  if (sourceMap === undefined) {
    return undefined;
  }
  const spanIds = sourceMap.spans
    .filter(
      (span) =>
        span.role === "body" ||
        span.role === "cost" ||
        span.role === "choiceOption",
    )
    .map((span) => span.id);
  return spanIds.length === 0
    ? undefined
    : {
        textKind: sourceMap.textKind,
        spanIds,
      };
};
