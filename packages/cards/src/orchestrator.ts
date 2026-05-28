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

type EffectLineParseResult =
  | { readonly ok: true; readonly value: ParsedEffectLine }
  | { readonly ok: false; readonly diagnostic: ParseFailureDiagnostic };

export function parseEffectLineDetailed(
  text: string,
  registry: EffectLineParserRegistry,
): EffectLineParseResult {
  const metadataLine = firstMetadataLineParse(registry.metadataLines ?? [], {
    text,
  });
  if (metadataLine !== undefined) {
    return { ok: true, value: metadataLine };
  }

  const entryPoint = firstEntryPointParse(registry.entryPoints, { text });
  if (entryPoint === undefined) {
    return {
      ok: false,
      diagnostic: {
        stage: "entryPoint",
        reason: "no entry-point parser matched",
        text,
      },
    };
  }

  const markerParse = parseMarkers(entryPoint.rest, registry.markers ?? []);
  const expression = firstExpressionParse(registry.expressions, {
    text: markerParse.rest,
    entryPoint: entryPoint.node,
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

  return {
    ok: true,
    value: {
      block: {
        category:
          expression.blockPatch?.category ?? entryPoint.node.category ?? "auto",
        trigger: entryPoint.node.trigger,
        ...((expression.blockPatch?.condition ?? entryPoint.node.condition) ===
        undefined
          ? {}
          : {
              condition:
                expression.blockPatch?.condition ?? entryPoint.node.condition,
            }),
        ...(expression.blockPatch?.cost === undefined
          ? {}
          : { cost: expression.blockPatch.cost }),
        sourcePresencePolicy: sourcePresencePolicy(entryPoint.evidence),
        ...markerParse.patch,
        effect: expression.effect,
      },
      evidence: [
        ...entryPoint.evidence,
        ...markerParse.evidence,
        ...expression.evidence,
        "composition:entryExpression",
      ],
    },
  };
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

      evidence.push(...result.evidence);
      rest = result.rest;
      consumed = true;
      break;
    }
  }

  return {
    rest,
    patch: oncePerTurn === true ? { oncePerTurn } : {},
    evidence,
  };
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
): "mustRemainInSameZone" | "resolveFromDestinationZone" | "noSourceRequired" {
  if (evidence.includes("sourcePresence:noSourceRequired")) {
    return "noSourceRequired";
  }

  if (evidence.includes("sourcePresence:resolveFromDestination")) {
    return "resolveFromDestinationZone";
  }

  return "mustRemainInSameZone";
}
