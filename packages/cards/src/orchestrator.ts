import type { Condition } from "@optcg/types";

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
  return result.ok ? result.value : undefined;
}

export function parseEffectLinesDetailed(
  text: string,
  registry: EffectLineParserRegistry,
):
  | { readonly ok: true; readonly value: readonly ParsedEffectLine[] }
  | { readonly ok: false; readonly diagnostic: ParseFailureDiagnostic } {
  const metadataLine = firstMetadataLineParse(registry.metadataLines ?? [], {
    text,
  });
  if (metadataLine !== undefined) {
    return { ok: true, value: [metadataLine] };
  }

  const leadingMarkerParse = parseMarkers(text, registry.markers ?? []);
  const entryPoints = parseEntryPointAlternatives(registry.entryPoints, {
    text: leadingMarkerParse.rest,
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

  const markerParse = parseMarkers(entryPoints.rest, registry.markers ?? []);
  const values: ParsedEffectLine[] = [];
  for (const entryPoint of entryPoints.values) {
    const entryExpressionCondition = combineConditions(
      leadingMarkerParse.patch.condition,
      entryPoint.node.condition,
      markerParse.patch.condition,
    );
    const expression = firstExpressionParse(registry.expressions, {
      text: markerParse.rest,
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
        sourcePresencePolicy: sourcePresencePolicy(entryPoint.evidence),
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
    }
  | { readonly ok: false; readonly text: string } {
  let rest = input.text;
  const values: EntryPointParseResult[] = [];
  for (;;) {
    const entryPoint = firstEntryPointParse(parsers, { text: rest });
    if (entryPoint === undefined) {
      return { ok: false, text: rest };
    }
    values.push(entryPoint);
    rest = entryPoint.rest.trimStart();
    if (!rest.startsWith("/")) {
      return { ok: true, values, rest };
    }
    rest = rest.slice(1).trimStart();
  }
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
  text: string,
  parsers: readonly MarkerParser[],
): {
  readonly rest: string;
  readonly patch: EffectBlockPatch;
  readonly evidence: readonly PrimitiveEvidence[];
} {
  let rest = text;
  let oncePerTurn: true | undefined;
  const conditions: Condition[] = [];
  const evidence: PrimitiveEvidence[] = [];

  let consumed = true;
  while (consumed) {
    consumed = false;
    for (const parser of parsers) {
      const result = parser({ text: rest });
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
      rest = result.rest;
      consumed = true;
      break;
    }
  }

  const markerCondition = combineConditions(...conditions);
  return {
    rest,
    patch: {
      ...(oncePerTurn === true ? { oncePerTurn } : {}),
      ...(markerCondition === undefined ? {} : { condition: markerCondition }),
    },
    evidence,
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
