import type {
  GeneratedSupportDiagnosticDecomposition,
  GeneratedSupportDiagnosticTraceComponent,
} from "./generated-support-types.js";

import {
  deriveConditionalConditionDiagnostics,
  deriveConditionalKeywordGrantDiagnostics,
  deriveProtectionBodyDiagnostics,
  parseKeywordGrantBody,
} from "./conditional-parser-components.js";

export function deriveConditionalContinuousCompositionDiagnosticDecomposition(
  sourceText: string,
): GeneratedSupportDiagnosticDecomposition | undefined {
  const conditional = parseContinuousCompositionIfWrapper(sourceText);
  if (conditional === undefined) {
    return undefined;
  }

  const split = parseConditionalBodyConjunctionParts(conditional.bodyText);
  if (split === undefined) {
    return undefined;
  }

  const bodyParts: ConditionalBodyDiagnosticSide[] = [];
  let canInferSharedSelfCharacterTarget = false;
  for (const [index, part] of split.parts.entries()) {
    const parsedPart = toBodyDiagnosticSide({
      inferSharedSelfCharacterTarget:
        canInferSharedSelfCharacterTarget &&
        looksLikeTargetlessKeywordGrantDiagnosticBody(part.text),
      index,
      start: conditional.bodyTextStart + part.start,
      text: part.text,
    });
    if (parsedPart === undefined) {
      return undefined;
    }
    bodyParts.push(parsedPart);
    canInferSharedSelfCharacterTarget = parsedPart.explicitSelfCharacterTarget;
  }

  const conditionDiagnostics = deriveConditionalConditionDiagnostics(
    conditional.conditionText,
  );
  const bodyFullySupported = bodyParts.every((side) => side.isFullySupported);
  const conditionFullySupported =
    conditionDiagnostics.isFullySupportedConditionExpression;
  const allComponentsSupported = conditionFullySupported && bodyFullySupported;

  return {
    recognizedActionCandidates: bodyParts
      .filter((side) => side.hasSupportedComponents)
      .map((side) => side.text),
    recognizedSyntaxFragments: [
      "if-conditional-wrapper",
      ...(conditionDiagnostics.hasSupportedConditionComponents
        ? ["condition-components:v1"]
        : []),
      "conditional-body-parts:ordered",
      ...(split.connectors.length > 0
        ? ["conditional-body-conjunction:and"]
        : []),
      ...bodyParts.flatMap((side) => side.recognizedSyntaxFragments),
    ],
    recognizedTriggerCandidates: [],
    reason: allComponentsSupported
      ? "Conditional continuous condition, protection, and keyword-grant components were recognized, but generated support remains fail-closed until schema/runtime bridge evidence represents the composed continuous source line."
      : "Conditional continuous composition syntax was recognized, but one or more component boundaries remain unsupported; generated support remains fail-closed.",
    traceComponents: [
      { kind: "wrapper", status: "recognized", text: "If" },
      ...offsetDiagnosticTraceComponentSpans(
        conditionDiagnostics.traceComponents,
        conditional.conditionTextStart,
      ),
      ...split.connectors.map((connector, index) => ({
        id: `conditional-body-connector:and:${String(index)}`,
        kind: "condition-connector" as const,
        span: {
          end: conditional.bodyTextStart + connector.end,
          start: conditional.bodyTextStart + connector.start,
          text: "and",
        },
        status: bodyFullySupported
          ? ("supported" as const)
          : ("unsupported" as const),
        text: "and",
      })),
      ...bodyParts.flatMap((side) => side.traceComponents),
    ],
    unsupportedConditionFragments:
      conditionDiagnostics.unsupportedConditionFragments,
    unsupportedSyntaxFragments: allComponentsSupported
      ? ["conditional-continuous-composition:schema-runtime-bridge-missing"]
      : [
          ...conditionDiagnostics.unsupportedSyntaxFragments,
          ...bodyParts.flatMap((side) => side.unsupportedSyntaxFragments),
          ...bodyParts
            .filter((side) => !side.isFullySupported)
            .map(
              () =>
                "conditional-continuous-composition:unsupported-body-fragment",
            ),
        ],
  };
}

type ConditionalBodyDiagnosticSide = {
  readonly explicitSelfCharacterTarget: boolean;
  readonly hasSupportedComponents: boolean;
  readonly isFullySupported: boolean;
  readonly recognizedSyntaxFragments: readonly string[];
  readonly text: string;
  readonly traceComponents: readonly GeneratedSupportDiagnosticTraceComponent[];
  readonly unsupportedSyntaxFragments: readonly string[];
};

function toBodyDiagnosticSide({
  inferSharedSelfCharacterTarget = false,
  index,
  start,
  text,
}: {
  readonly inferSharedSelfCharacterTarget?: boolean;
  readonly index: number;
  readonly start: number;
  readonly text: string;
}): ConditionalBodyDiagnosticSide | undefined {
  const protectionDiagnostics = deriveProtectionBodyDiagnostics(text);
  if (
    looksLikeProtectionDiagnosticBody(text) ||
    protectionDiagnostics.isFullySupportedProtectionBody
  ) {
    return {
      explicitSelfCharacterTarget:
        protectionDiagnostics.hasSupportedProtectionComponents,
      hasSupportedComponents:
        protectionDiagnostics.hasSupportedProtectionComponents,
      isFullySupported: protectionDiagnostics.isFullySupportedProtectionBody,
      recognizedSyntaxFragments: [
        ...(protectionDiagnostics.hasSupportedProtectionComponents
          ? ["protection-components:v1"]
          : []),
        ...(protectionDiagnostics.isFullySupportedProtectionBody
          ? ["protection:opponent-effect-field-removal"]
          : []),
      ],
      text,
      traceComponents: [
        ...offsetDiagnosticTraceComponentSpans(
          protectionDiagnostics.traceComponents,
          start,
        ),
        ...toBodyPartTraceComponent({
          index,
          isFullySupported:
            protectionDiagnostics.isFullySupportedProtectionBody,
          start,
          text,
        }),
      ],
      unsupportedSyntaxFragments:
        protectionDiagnostics.isFullySupportedProtectionBody
          ? []
          : protectionDiagnostics.unsupportedSyntaxFragments,
    };
  }

  if (inferSharedSelfCharacterTarget) {
    const sharedTargetSide = toSharedSelfCharacterKeywordGrantSide({
      index,
      start,
      text,
    });
    if (sharedTargetSide !== undefined) {
      return sharedTargetSide;
    }
  }

  const diagnostics = deriveConditionalKeywordGrantDiagnostics(text);
  if (
    !diagnostics.hasSupportedKeywordGrantComponents &&
    !looksLikeKeywordGrantDiagnosticBody(text)
  ) {
    return undefined;
  }

  return {
    explicitSelfCharacterTarget: diagnostics.hasSupportedKeywordGrantComponents,
    hasSupportedComponents: diagnostics.hasSupportedKeywordGrantComponents,
    isFullySupported: diagnostics.isFullySupportedKeywordGrantBody,
    recognizedSyntaxFragments: diagnostics.hasSupportedKeywordGrantComponents
      ? ["keyword-grant-components:v1"]
      : [],
    text,
    traceComponents: [
      ...offsetDiagnosticTraceComponentSpans(
        diagnostics.traceComponents,
        start,
      ),
      ...toBodyPartTraceComponent({
        index,
        isFullySupported: diagnostics.isFullySupportedKeywordGrantBody,
        start,
        text,
      }),
    ],
    unsupportedSyntaxFragments: diagnostics.isFullySupportedKeywordGrantBody
      ? []
      : diagnostics.unsupportedSyntaxFragments,
  };
}

function toSharedSelfCharacterKeywordGrantSide({
  index,
  start,
  text,
}: {
  readonly index: number;
  readonly start: number;
  readonly text: string;
}): ConditionalBodyDiagnosticSide | undefined {
  const inferredTargetPrefix = "this Character ";
  const parsed = parseKeywordGrantBody(`${inferredTargetPrefix}${text}`);
  if (parsed.type === "unsupported-fragment") {
    return undefined;
  }

  const rebase = (span: {
    readonly end: number;
    readonly start: number;
    readonly text: string;
  }) => ({
    end: start + span.end - inferredTargetPrefix.length,
    start: start + span.start - inferredTargetPrefix.length,
    text: span.text,
  });

  return {
    explicitSelfCharacterTarget: true,
    hasSupportedComponents: true,
    isFullySupported: true,
    recognizedSyntaxFragments: ["keyword-grant-components:v1"],
    text,
    traceComponents: [
      {
        id: parsed.target.id,
        kind: "target",
        status: "recognized",
        text: parsed.target.text,
      },
      {
        id: parsed.verb.id,
        kind: "action",
        span: rebase(parsed.verb.span),
        status: "supported",
        text: parsed.verb.text,
      },
      {
        id: parsed.keyword.id,
        kind: "keyword",
        span: rebase(parsed.keyword.span),
        status: "supported",
        text: parsed.keyword.text,
      },
      ...toBodyPartTraceComponent({
        index,
        isFullySupported: true,
        start,
        text,
      }),
    ],
    unsupportedSyntaxFragments: [],
  };
}

function toBodyPartTraceComponent({
  index,
  isFullySupported,
  start,
  text,
}: {
  readonly index: number;
  readonly isFullySupported: boolean;
  readonly start: number;
  readonly text: string;
}): readonly GeneratedSupportDiagnosticTraceComponent[] {
  return [
    {
      id: `conditional-body-part:${String(index)}`,
      kind: "action",
      span: {
        end: start + text.length,
        start,
        text,
      },
      status: isFullySupported ? "supported" : "unsupported",
      text,
    },
  ];
}

function offsetDiagnosticTraceComponentSpans(
  components: readonly GeneratedSupportDiagnosticTraceComponent[],
  offset: number,
): readonly GeneratedSupportDiagnosticTraceComponent[] {
  return components.map((component) => {
    if (component.span === undefined) {
      return component;
    }

    return {
      ...component,
      span: {
        ...component.span,
        end: component.span.end + offset,
        start: component.span.start + offset,
      },
    };
  });
}

function looksLikeProtectionDiagnosticBody(bodyText: string): boolean {
  return /\bcannot be removed\b/i.test(bodyText);
}

function looksLikeKeywordGrantDiagnosticBody(bodyText: string): boolean {
  return /^(?:this Character\s+)?(?:gains|gets)\s+\[[^\]]+\]/i.test(
    bodyText.trim(),
  );
}

function looksLikeTargetlessKeywordGrantDiagnosticBody(
  bodyText: string,
): boolean {
  return /^(?:gains|gets)\s+\[[^\]]+\]/i.test(bodyText.trim());
}

function parseContinuousCompositionIfWrapper(sourceText: string):
  | {
      readonly bodyText: string;
      readonly bodyTextStart: number;
      readonly conditionText: string;
      readonly conditionTextStart: number;
    }
  | undefined {
  const normalized = sourceText.trim();
  const match = /^If\s+(.+?),\s*(.+)$/i.exec(normalized);
  if (match === null) {
    return undefined;
  }

  const conditionText = match[1]?.trim() ?? "";
  const rawBodyText = match[2]?.trim() ?? "";
  const bodyText = rawBodyText.replace(/\.$/, "");
  if (conditionText.length === 0 || bodyText.length === 0) {
    return undefined;
  }

  return {
    bodyText,
    bodyTextStart: normalized.indexOf(rawBodyText),
    conditionText,
    conditionTextStart: normalized.indexOf(conditionText),
  };
}

function parseConditionalBodyConjunctionParts(bodyText: string):
  | {
      readonly connectors: readonly { end: number; start: number }[];
      readonly parts: readonly { start: number; text: string }[];
    }
  | undefined {
  if (/[;,]/.test(bodyText)) {
    return undefined;
  }

  const matches = [...bodyText.matchAll(/\s+and\s+/gi)];
  const parts: { start: number; text: string }[] = [];
  const connectors: { end: number; start: number }[] = [];
  let cursor = 0;
  for (const match of matches) {
    const connectorStart = match.index + 1;
    const connectorEnd = connectorStart + "and".length;
    const partText = bodyText.slice(cursor, connectorStart).trim();
    if (partText.length === 0) {
      return undefined;
    }
    const partStart = bodyText.indexOf(partText, cursor);
    parts.push({ start: partStart, text: partText });
    connectors.push({ end: connectorEnd, start: connectorStart });
    cursor = connectorEnd;
  }
  const lastPart = bodyText.slice(cursor).trim();
  if (lastPart.length === 0) {
    return undefined;
  }
  const lastPartStart = bodyText.indexOf(lastPart, cursor);
  parts.push({ start: lastPartStart, text: lastPart });
  return { connectors, parts };
}
