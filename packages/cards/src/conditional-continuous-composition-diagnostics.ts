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

  const split = parseConditionalBodyConjunction(conditional.bodyText);
  if (split === undefined) {
    return undefined;
  }

  const leftProtection = toBodyDiagnosticSide({
    kind: "protection",
    side: "left",
    start: conditional.bodyTextStart + split.leftStart,
    text: split.left,
  });
  const rightKeywordGrant = toBodyDiagnosticSide({
    inferSharedSelfCharacterTarget:
      leftProtection?.isFullySupported === true &&
      looksLikeTargetlessKeywordGrantDiagnosticBody(split.right),
    kind: "keywordGrant",
    side: "right",
    start: conditional.bodyTextStart + split.rightStart,
    text: split.right,
  });
  const leftKeywordGrant = toBodyDiagnosticSide({
    kind: "keywordGrant",
    side: "left",
    start: conditional.bodyTextStart + split.leftStart,
    text: split.left,
  });
  const rightProtection = toBodyDiagnosticSide({
    kind: "protection",
    side: "right",
    start: conditional.bodyTextStart + split.rightStart,
    text: split.right,
  });

  const orderedSides =
    leftProtection !== undefined && rightKeywordGrant !== undefined
      ? [leftProtection, rightKeywordGrant]
      : leftKeywordGrant !== undefined && rightProtection !== undefined
        ? [leftKeywordGrant, rightProtection]
        : undefined;
  if (orderedSides === undefined) {
    return undefined;
  }

  const conditionDiagnostics = deriveConditionalConditionDiagnostics(
    conditional.conditionText,
  );
  const bodyFullySupported = orderedSides.every(
    (side) => side.isFullySupported,
  );
  const conditionFullySupported =
    conditionDiagnostics.isFullySupportedConditionExpression;
  const allComponentsSupported = conditionFullySupported && bodyFullySupported;

  return {
    recognizedActionCandidates: orderedSides
      .filter((side) => side.hasSupportedComponents)
      .map((side) => side.text),
    recognizedSyntaxFragments: [
      "if-conditional-wrapper",
      ...(conditionDiagnostics.hasSupportedConditionComponents
        ? ["condition-components:v1"]
        : []),
      "conditional-body-conjunction:and",
      ...orderedSides.flatMap((side) => side.recognizedSyntaxFragments),
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
      {
        id: "conditional-body-connector:and",
        kind: "condition-connector",
        span: {
          end: conditional.bodyTextStart + split.connectorEnd,
          start: conditional.bodyTextStart + split.connectorStart,
          text: "and",
        },
        status: bodyFullySupported ? "supported" : "unsupported",
        text: "and",
      },
      ...orderedSides.flatMap((side) => side.traceComponents),
    ],
    unsupportedConditionFragments:
      conditionDiagnostics.unsupportedConditionFragments,
    unsupportedSyntaxFragments: allComponentsSupported
      ? ["conditional-continuous-composition:schema-runtime-bridge-missing"]
      : [
          ...conditionDiagnostics.unsupportedSyntaxFragments,
          ...orderedSides.flatMap((side) => side.unsupportedSyntaxFragments),
          ...orderedSides
            .filter((side) => !side.isFullySupported)
            .map(
              () =>
                "conditional-continuous-composition:unsupported-body-fragment",
            ),
        ],
  };
}

type ConditionalBodyDiagnosticSide = {
  readonly hasSupportedComponents: boolean;
  readonly isFullySupported: boolean;
  readonly recognizedSyntaxFragments: readonly string[];
  readonly text: string;
  readonly traceComponents: readonly GeneratedSupportDiagnosticTraceComponent[];
  readonly unsupportedSyntaxFragments: readonly string[];
};

function toBodyDiagnosticSide({
  inferSharedSelfCharacterTarget = false,
  kind,
  side,
  start,
  text,
}: {
  readonly inferSharedSelfCharacterTarget?: boolean;
  readonly kind: "keywordGrant" | "protection";
  readonly side: "left" | "right";
  readonly start: number;
  readonly text: string;
}): ConditionalBodyDiagnosticSide | undefined {
  if (kind === "protection") {
    const diagnostics = deriveProtectionBodyDiagnostics(text);
    if (
      !diagnostics.hasSupportedProtectionComponents &&
      !looksLikeProtectionDiagnosticBody(text)
    ) {
      return undefined;
    }

    return {
      hasSupportedComponents: diagnostics.hasSupportedProtectionComponents,
      isFullySupported: diagnostics.isFullySupportedProtectionBody,
      recognizedSyntaxFragments: [
        ...(diagnostics.hasSupportedProtectionComponents
          ? ["protection-components:v1"]
          : []),
        ...(diagnostics.isFullySupportedProtectionBody
          ? ["protection:opponent-effect-field-removal"]
          : []),
      ],
      text,
      traceComponents: [
        ...offsetDiagnosticTraceComponentSpans(
          diagnostics.traceComponents,
          start,
        ),
        ...toUnsupportedBodyTraceComponents({
          isFullySupported: diagnostics.isFullySupportedProtectionBody,
          side,
          start,
          text,
        }),
      ],
      unsupportedSyntaxFragments: diagnostics.isFullySupportedProtectionBody
        ? []
        : diagnostics.unsupportedSyntaxFragments,
    };
  }

  if (inferSharedSelfCharacterTarget) {
    const sharedTargetSide = toSharedSelfCharacterKeywordGrantSide({
      side,
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
      ...toUnsupportedBodyTraceComponents({
        isFullySupported: diagnostics.isFullySupportedKeywordGrantBody,
        side,
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
  side,
  start,
  text,
}: {
  readonly side: "left" | "right";
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
      ...toUnsupportedBodyTraceComponents({
        isFullySupported: true,
        side,
        start,
        text,
      }),
    ],
    unsupportedSyntaxFragments: [],
  };
}

function toUnsupportedBodyTraceComponents({
  isFullySupported,
  side,
  start,
  text,
}: {
  readonly isFullySupported: boolean;
  readonly side: "left" | "right";
  readonly start: number;
  readonly text: string;
}): readonly GeneratedSupportDiagnosticTraceComponent[] {
  if (isFullySupported) {
    return [];
  }

  return [
    {
      id: `conditional-body:unsupported-${side}`,
      kind: "action",
      span: {
        end: start + text.length,
        start,
        text,
      },
      status: "unsupported",
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

function parseConditionalBodyConjunction(bodyText: string):
  | {
      readonly connectorEnd: number;
      readonly connectorStart: number;
      readonly left: string;
      readonly leftStart: number;
      readonly right: string;
      readonly rightStart: number;
    }
  | undefined {
  const matches = [...bodyText.matchAll(/\s+and\s+/gi)];
  if (matches.length !== 1) {
    return undefined;
  }

  const match = matches[0];
  if (match === undefined) {
    return undefined;
  }

  const connectorStart = match.index + 1;
  const connectorEnd = connectorStart + "and".length;
  const left = bodyText.slice(0, connectorStart).trim();
  const right = bodyText.slice(connectorEnd).trim();
  if (left.length === 0 || right.length === 0) {
    return undefined;
  }

  return {
    connectorEnd,
    connectorStart,
    left,
    leftStart: bodyText.indexOf(left),
    right,
    rightStart: bodyText.lastIndexOf(right),
  };
}
