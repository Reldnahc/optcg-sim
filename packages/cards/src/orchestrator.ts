import type { Condition, EffectTextSpan } from "@optcg/types";

import type {
  EntryPointParseResult,
  ExpressionParseResult,
  EffectBlockPatch,
  MarkerParser,
  ParsedEffectLine,
  ParsedMetadataLine,
  ParseInput,
  ParseFailureDiagnostic,
  PrimitiveEvidence,
} from "./types.js";
import { createSourceSlice, type SourceSlice } from "./source-slices.js";
import { normalizeParserText } from "./text-normalization.js";

export type EntryPointParser = (
  input: ParseInput,
) => EntryPointParseResult | undefined;

export type ExpressionParser = (
  input: ParseInput,
) => ExpressionParseResult | undefined;

export type MetadataLineParser = (
  input: ParseInput,
) => ParsedMetadataLine | undefined;

export interface EffectLineParserRegistry {
  readonly metadataLines?: readonly MetadataLineParser[];
  readonly entryPoints: readonly EntryPointParser[];
  readonly markers?: readonly MarkerParser[];
  readonly expressions: readonly ExpressionParser[];
}

export function parseEffectLine(
  text: string,
  registry: EffectLineParserRegistry,
): ParsedEffectLine | undefined {
  const result = parseEffectLineDetailed(text, registry);
  return result.ok ? stripSourceMap(result.value) : undefined;
}

export function parseEffectLinesDetailed(
  text: string,
  registry: EffectLineParserRegistry,
):
  | { readonly ok: true; readonly value: readonly ParsedEffectLine[] }
  | { readonly ok: false; readonly diagnostic: ParseFailureDiagnostic } {
  const normalizedText = normalizeParserText(text);
  const rootSource = createSourceSlice(normalizedText);
  const metadataLine = firstMetadataLineParse(registry.metadataLines ?? [], {
    text: normalizedText,
    source: rootSource,
  });
  if (metadataLine !== undefined) {
    return { ok: true, value: [metadataLine] };
  }

  const leadingMarkerParse = parseMarkers(
    { text: normalizedText, source: rootSource },
    registry.markers ?? [],
  );
  const entryPoints = parseEntryPointAlternatives(registry.entryPoints, {
    text: leadingMarkerParse.rest,
    ...(leadingMarkerParse.restSource === undefined
      ? {}
      : { source: leadingMarkerParse.restSource }),
  });
  if (!entryPoints.ok) {
    return {
      ok: false,
      diagnostic: {
        stage: "entryPoint",
        reason: "no entry-point parser matched",
        text: entryPoints.text,
      },
    };
  }

  const markerParse = parseMarkers(
    {
      text: entryPoints.rest,
      ...(entryPoints.restSource === undefined
        ? {}
        : { source: entryPoints.restSource }),
    },
    registry.markers ?? [],
  );
  const values: ParsedEffectLine[] = [];
  for (const entryPoint of entryPoints.values) {
    const entryExpressionCondition = combineConditions(
      leadingMarkerParse.patch.condition,
      entryPoint.node.condition,
      markerParse.patch.condition,
    );
    const expression = firstExpressionParse(registry.expressions, {
      text: markerParse.rest,
      ...(markerParse.restSource === undefined
        ? {}
        : { source: markerParse.restSource }),
      entryPoint: {
        ...entryPoint.node,
        ...(entryExpressionCondition === undefined
          ? {}
          : { condition: entryExpressionCondition }),
      },
    });
    if (expression === undefined || expression.rest.trim().length > 0) {
      return {
        ok: false,
        diagnostic: {
          stage: "expression",
          reason:
            expression === undefined
              ? "no expression parser matched"
              : "expression parser left unparsed residue",
          text: expression === undefined ? markerParse.rest : expression.rest,
        },
      };
    }

    const spans = [
      ...leadingMarkerParse.presentationSpans,
      ...(entryPoint.presentationSpans ?? []),
      ...markerParse.presentationSpans,
      ...(expression.presentationSpans ?? []),
    ];

    const condition = combineConditions(
      leadingMarkerParse.patch.condition,
      entryPoint.node.condition,
      markerParse.patch.condition,
      expression.blockPatch?.condition,
    );

    values.push({
      block: {
        category:
          expression.blockPatch?.category ?? entryPoint.node.category ?? "auto",
        trigger: expression.blockPatch?.trigger ?? entryPoint.node.trigger,
        ...(condition === undefined ? {} : { condition }),
        ...(expression.blockPatch?.cost === undefined
          ? {}
          : { cost: expression.blockPatch.cost }),
        ...(expression.blockPatch?.optional === undefined
          ? {}
          : { optional: expression.blockPatch.optional }),
        sourcePresencePolicy:
          expression.blockPatch?.sourcePresencePolicy ??
          sourcePresencePolicy(entryPoint.evidence),
        ...(leadingMarkerParse.patch.oncePerTurn === true
          ? { oncePerTurn: true as const }
          : {}),
        ...markerParse.patch,
        effect: expression.effect,
      },
      evidence: [
        ...leadingMarkerParse.evidence,
        ...entryPoint.evidence,
        ...markerParse.evidence,
        ...expression.evidence,
        ...(entryPoints.values.length > 1
          ? (["composition:entryAlternatives"] as const)
          : []),
        "composition:entryExpression",
      ],
      ...(spans.length === 0
        ? {}
        : {
            sourceMap: {
              textKind:
                entryPoint.node.trigger.type === "trigger"
                  ? "trigger"
                  : "effect",
              sourceText: rootSource.rawText,
              spans,
            },
          }),
    });
  }

  return { ok: true, value: values };
}

type EffectLineParseResult =
  | { readonly ok: true; readonly value: ParsedEffectLine }
  | { readonly ok: false; readonly diagnostic: ParseFailureDiagnostic };

export function parseEffectLineDetailed(
  text: string,
  registry: EffectLineParserRegistry,
): EffectLineParseResult {
  const result = parseEffectLinesDetailed(text, registry);
  if (!result.ok) {
    return result;
  }
  const first = result.value[0];
  if (first === undefined) {
    return {
      ok: false,
      diagnostic: {
        stage: "entryPoint",
        reason: "no entry-point parser matched",
        text,
      },
    };
  }
  return { ok: true, value: first };
}

function parseEntryPointAlternatives(
  parsers: readonly EntryPointParser[],
  input: ParseInput,
):
  | {
      readonly ok: true;
      readonly values: readonly EntryPointParseResult[];
      readonly rest: string;
      readonly restSource?: SourceSlice;
    }
  | { readonly ok: false; readonly text: string } {
  let rest = input.text;
  let restSource = input.source;
  const values: EntryPointParseResult[] = [];
  let sharedTurnWindow:
    | {
        readonly condition: Condition;
        readonly evidence: readonly PrimitiveEvidence[];
      }
    | undefined;
  for (;;) {
    const entryPoint = firstEntryPointParse(parsers, {
      text: rest,
      ...(restSource === undefined ? {} : { source: restSource }),
    });
    if (entryPoint === undefined) {
      return { ok: false, text: rest };
    }
    const value = applySharedTurnWindow(entryPoint, sharedTurnWindow);
    values.push(value);
    sharedTurnWindow ??= sharedTurnWindowContext(entryPoint);
    const beforeEntryRest = rest;
    rest = entryPoint.rest.trimStart();
    restSource = sourceForRest(restSource, beforeEntryRest, rest);
    if (!rest.startsWith("/")) {
      return {
        ok: true,
        values,
        rest,
        ...(restSource === undefined ? {} : { restSource }),
      };
    }
    const beforeSlashRest = rest;
    rest = rest.slice(1).trimStart();
    restSource = sourceForRest(restSource, beforeSlashRest, rest);
  }
}

function applySharedTurnWindow(
  entryPoint: EntryPointParseResult,
  shared:
    | {
        readonly condition: Condition;
        readonly evidence: readonly PrimitiveEvidence[];
      }
    | undefined,
): EntryPointParseResult {
  if (
    shared === undefined ||
    entryPoint.evidence.includes("entry:yourTurn") ||
    entryPoint.evidence.includes("entry:opponentTurn")
  ) {
    return entryPoint;
  }

  const combinedCondition = combineConditions(
    shared.condition,
    entryPoint.node.condition,
  );

  return {
    ...entryPoint,
    node: {
      ...entryPoint.node,
      ...(combinedCondition === undefined
        ? {}
        : { condition: combinedCondition }),
    },
    evidence: [...shared.evidence, ...entryPoint.evidence],
  };
}

function sharedTurnWindowContext(entryPoint: EntryPointParseResult):
  | {
      readonly condition: Condition;
      readonly evidence: readonly PrimitiveEvidence[];
    }
  | undefined {
  if (entryPoint.evidence.includes("entry:yourTurn")) {
    return {
      condition: { type: "yourTurn" },
      evidence: ["entry:yourTurn", "condition:yourTurn"],
    };
  }
  if (entryPoint.evidence.includes("entry:opponentTurn")) {
    return {
      condition: { type: "opponentTurn" },
      evidence: ["entry:opponentTurn", "condition:opponentTurn"],
    };
  }
  return undefined;
}

function firstMetadataLineParse(
  parsers: readonly MetadataLineParser[],
  input: ParseInput,
): ParsedMetadataLine | undefined {
  for (const parser of parsers) {
    const result = parser(input);
    if (result !== undefined) {
      return result;
    }
  }

  return undefined;
}

function parseMarkers(
  input: ParseInput,
  parsers: readonly MarkerParser[],
): {
  readonly rest: string;
  readonly restSource?: SourceSlice;
  readonly patch: EffectBlockPatch;
  readonly evidence: readonly PrimitiveEvidence[];
  readonly presentationSpans: readonly EffectTextSpan[];
} {
  let rest = input.text;
  let restSource = input.source;
  let oncePerTurn: true | undefined;
  const conditions: Condition[] = [];
  const evidence: PrimitiveEvidence[] = [];
  const presentationSpans: EffectTextSpan[] = [];

  let consumed = true;
  while (consumed) {
    consumed = false;
    for (const parser of parsers) {
      const result = parser({
        text: rest,
        ...(restSource === undefined ? {} : { source: restSource }),
      });
      if (result === undefined) {
        continue;
      }

      if (result.patch.oncePerTurn === true) {
        oncePerTurn = true;
      }
      if (result.patch.condition !== undefined) {
        conditions.push(result.patch.condition);
      }

      evidence.push(...result.evidence);
      presentationSpans.push(...(result.presentationSpans ?? []));
      const beforeRest = rest;
      rest = result.rest;
      restSource = sourceForRest(restSource, beforeRest, rest);
      consumed = true;
      break;
    }
  }

  const markerCondition = combineConditions(...conditions);
  return {
    rest,
    ...(restSource === undefined ? {} : { restSource }),
    patch: {
      ...(oncePerTurn === true ? { oncePerTurn } : {}),
      ...(markerCondition === undefined ? {} : { condition: markerCondition }),
    },
    evidence,
    presentationSpans,
  };
}

function sourceForRest(
  source: SourceSlice | undefined,
  currentText: string,
  restText: string,
): SourceSlice | undefined {
  if (source === undefined) {
    return undefined;
  }

  const restIndex =
    restText.length === 0
      ? currentText.length
      : currentText.lastIndexOf(restText);
  const startOffset =
    restIndex >= 0 ? restIndex : currentText.length - restText.length;
  return {
    text: restText,
    rawText: restText,
    start: source.start + Math.max(0, startOffset),
    end: source.end,
  };
}

function combineConditions(
  ...conditions: readonly (Condition | undefined)[]
): Condition | undefined {
  const present = conditions.filter(
    (condition): condition is Condition => condition !== undefined,
  );
  if (present.length === 0) {
    return undefined;
  }
  if (present.length === 1) {
    return present[0];
  }
  return { type: "and", conditions: present };
}

function firstEntryPointParse(
  parsers: readonly EntryPointParser[],
  input: ParseInput,
): EntryPointParseResult | undefined {
  for (const parser of parsers) {
    const result = parser(input);
    if (result !== undefined) {
      return result;
    }
  }

  return undefined;
}

function firstExpressionParse(
  parsers: readonly ExpressionParser[],
  input: ParseInput,
): ExpressionParseResult | undefined {
  for (const parser of parsers) {
    const result = parser(input);
    if (result !== undefined) {
      return result;
    }
  }

  return undefined;
}

function sourcePresencePolicy(
  evidence: readonly string[],
):
  | "mustRemainInSameZone"
  | "resolveFromDestinationZone"
  | "resolveFromLastKnownInformation"
  | "noSourceRequired" {
  if (evidence.includes("sourcePresence:noSourceRequired")) {
    return "noSourceRequired";
  }

  if (evidence.includes("sourcePresence:resolveFromLastKnownInformation")) {
    return "resolveFromLastKnownInformation";
  }

  if (evidence.includes("sourcePresence:resolveFromDestination")) {
    return "resolveFromDestinationZone";
  }

  return "mustRemainInSameZone";
}

function stripSourceMap(line: ParsedEffectLine): ParsedEffectLine {
  if (!("block" in line)) {
    return line;
  }

  return {
    ...(line.kind === undefined ? {} : { kind: line.kind }),
    block: line.block,
    evidence: line.evidence,
  };
}
