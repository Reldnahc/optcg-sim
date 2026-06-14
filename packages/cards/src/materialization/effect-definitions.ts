import type {
  CardId,
  EffectBlock,
  EffectDefinition,
  EffectTextPresentationRef,
  EffectTextSourceMap,
  ParserSupportCertificate,
} from "@optcg/types";

import { parseCardEffectLinesDetailed } from "../card-effect-line-parser.js";
import {
  presentationSpanScope,
  scopePresentationSpan,
} from "../presentation-span-ids.js";
import type { ParsedRuntimeEffectLine } from "../types.js";
import { createParserSupportCertificate } from "./support-certificate.js";

interface EffectMaterializationVersions {
  readonly effectDefinitionsVersion: string;
  readonly rulesVersion: string;
}

export interface RuntimeSupportEvaluation {
  readonly supported: boolean;
  readonly reason?: string;
}

export interface RuntimeSupportEvaluationContext {
  readonly siblingBlocks: readonly EffectBlock[];
}

export type RuntimeSupportEvaluator = (
  block: EffectBlock,
  context?: RuntimeSupportEvaluationContext,
) => RuntimeSupportEvaluation;

interface EffectMaterializationOptions {
  readonly evaluateRuntimeSupport?: RuntimeSupportEvaluator;
}

const missingRuntimeSupportEvaluator = (): RuntimeSupportEvaluation => ({
  supported: false,
  reason: "runtime evaluator unavailable",
});

export const materializeEffectDefinition = (
  cardId: CardId,
  lines: readonly string[],
  sourceTextHash: string,
  versions: EffectMaterializationVersions,
  options: EffectMaterializationOptions = {},
): {
  readonly definition?: EffectDefinition;
  readonly runtimeSupported: boolean;
  readonly diagnostics: readonly string[];
  readonly parserCertificate: ParserSupportCertificate;
} => {
  const evaluateRuntimeSupport =
    options.evaluateRuntimeSupport ?? missingRuntimeSupportEvaluator;
  const blocks: EffectBlock[] = [];
  const diagnostics: string[] = [];
  const parsedRuntimeLines: ParsedRuntimeEffectLine[] = [];
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
      (value): value is ParsedRuntimeEffectLine => value.kind !== "metadata",
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
      parsedRuntimeLines.push({
        ...value,
        ...(sourceMap === undefined ? {} : { sourceMap }),
      });
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
      blocks.push(block);
    }
  }

  const runtimeSupportByBlock = new Map<
    EffectBlock["id"],
    RuntimeSupportEvaluation
  >();
  for (const block of blocks) {
    const runtimeSupport = evaluateRuntimeSupport(block, {
      siblingBlocks: blocks,
    });
    runtimeSupportByBlock.set(block.id, runtimeSupport);
    if (!runtimeSupport.supported) {
      const lineNumber = blockLineNumber(block.id);
      diagnostics.push(
        `line ${lineNumber ?? "unknown"} runtime unsupported: ${
          runtimeSupport.reason ?? "unknown reason"
        }`,
      );
    }
  }

  const parserCertificate = createParserSupportCertificate(parsedRuntimeLines);
  for (const missing of parserCertificate.missing) {
    diagnostics.push(
      `parser unsupported: ${missing.family}:${missing.id}: ${missing.reason}`,
    );
  }

  if (lines.length === 0) {
    return { runtimeSupported: true, diagnostics, parserCertificate };
  }
  const runtimeSupported =
    parserCertificate.complete &&
    parsedLineCount === lines.length &&
    blocks.length > 0 &&
    blocks.every(
      (block) => runtimeSupportByBlock.get(block.id)?.supported === true,
    );
  if (!runtimeSupported) {
    return { runtimeSupported: false, diagnostics, parserCertificate };
  }

  return {
    runtimeSupported: true,
    diagnostics,
    parserCertificate,
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

const blockLineNumber = (id: EffectBlock["id"]): string | undefined => {
  const parts = String(id).split(":generated:");
  const suffix = parts[1];
  if (suffix === undefined) {
    return undefined;
  }
  return suffix.split(":")[0];
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
        span.role === "choice" ||
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
