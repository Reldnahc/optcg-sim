import type {
  GeneratedSupportDiagnosticTraceComponent,
  GeneratedSupportUnparsedSpan,
} from "./generated-support-types.js";

export type ParsedConditionComponent =
  | { readonly type: "yourTurn" }
  | {
      readonly op: "gte";
      readonly target: { readonly type: "self" };
      readonly type: "attachedDonCount";
      readonly value: number;
    }
  | {
      readonly op: "gte";
      readonly player: "self";
      readonly type: "leaderColorCount";
      readonly value: 2;
    }
  | {
      readonly filter: {
        readonly categories: readonly ["leader"];
        readonly typesAny: readonly [string];
      };
      readonly player: "self";
      readonly type: "hasCardInZone";
      readonly zone: "leaderArea";
    }
  | {
      readonly filter: {
        readonly attributesAny: readonly [string];
        readonly categories: readonly ["leader"];
      };
      readonly player: "self";
      readonly type: "hasCardInZone";
      readonly zone: "leaderArea";
    }
  | {
      readonly op: "gte" | "lte";
      readonly player: "self" | "opponent";
      readonly type: "handCount" | "lifeCount";
      readonly value: number;
    };

export type ConditionExpressionParse =
  | {
      readonly component: ParsedConditionComponent;
      readonly id: string;
      readonly span: GeneratedSupportUnparsedSpan;
      readonly text: string;
      readonly type: "supported";
    }
  | {
      readonly connector: "and" | "or";
      readonly connectorSpan: GeneratedSupportUnparsedSpan;
      readonly id: string;
      readonly left: ConditionExpressionParse;
      readonly right: ConditionExpressionParse;
      readonly span: GeneratedSupportUnparsedSpan;
      readonly text: string;
      readonly type: "connector";
    }
  | {
      readonly id: string;
      readonly span: GeneratedSupportUnparsedSpan;
      readonly text: string;
      readonly type: "unsupported-fragment";
    };

type ConnectorCandidate = {
  connector: "and" | "or";
  connectorEnd: number;
  connectorStart: number;
  left: string;
  leftStart: number;
  right: string;
  rightStart: number;
};

type ConditionalDiagnostics = {
  readonly hasAmbiguousMixedConnectors: boolean;
  readonly hasSupportedConditionComponents: boolean;
  readonly isFullySupportedConditionExpression: boolean;
  readonly traceComponents: readonly GeneratedSupportDiagnosticTraceComponent[];
  readonly unsupportedConditionFragments: readonly string[];
  readonly unsupportedSyntaxFragments: readonly string[];
};

export function parseConditionExpression(
  sourceText: string,
): ConditionExpressionParse {
  return parseConditionExpressionAtOffset(sourceText.trim(), 0);
}

function parseConditionExpressionAtOffset(
  sourceText: string,
  offset: number,
): ConditionExpressionParse {
  const normalized = sourceText.trim();
  const trimmedStart = sourceText.indexOf(normalized);
  const absoluteStart = offset + Math.max(trimmedStart, 0);
  const absoluteEnd = absoluteStart + normalized.length;
  const span: GeneratedSupportUnparsedSpan = {
    end: absoluteEnd,
    start: absoluteStart,
    text: normalized,
  };

  const direct = parseConditionComponent(normalized);
  if (direct !== undefined) {
    return {
      component: direct,
      id: toConditionComponentId(direct),
      span,
      text: normalized,
      type: "supported",
    };
  }

  const connectors = parseConditionConnectorCandidates(
    normalized,
    absoluteStart,
  );
  for (const connector of connectors) {
    const left = parseConditionExpressionAtOffset(
      connector.left,
      connector.leftStart,
    );
    const right = parseConditionExpressionAtOffset(
      connector.right,
      connector.rightStart,
    );
    if (
      isSupportedConditionExpression(left) &&
      isSupportedConditionExpression(right)
    ) {
      return {
        connector: connector.connector,
        connectorSpan: {
          end: connector.connectorEnd,
          start: connector.connectorStart,
          text: connector.connector,
        },
        id: toConnectorId(connector),
        left,
        right,
        span,
        text: normalized,
        type: "connector",
      };
    }
  }

  const fallback = connectors[0];
  if (fallback === undefined) {
    return {
      id: `condition:unsupported:${String(absoluteStart)}-${String(absoluteEnd)}`,
      span,
      text: normalized,
      type: "unsupported-fragment",
    };
  }

  return {
    connector: fallback.connector,
    connectorSpan: {
      end: fallback.connectorEnd,
      start: fallback.connectorStart,
      text: fallback.connector,
    },
    id: toConnectorId(fallback),
    left: parseConditionExpressionAtOffset(fallback.left, fallback.leftStart),
    right: parseConditionExpressionAtOffset(
      fallback.right,
      fallback.rightStart,
    ),
    span,
    text: normalized,
    type: "connector",
  };
}

export function deriveConditionalConditionDiagnostics(
  conditionText: string,
): ConditionalDiagnostics {
  const parsed = parseConditionExpression(conditionText);
  const hasAmbiguousMixedConnectors = hasMixedConnectors(parsed);
  return {
    hasAmbiguousMixedConnectors,
    hasSupportedConditionComponents: hasAnySupportedConditionComponent(parsed),
    isFullySupportedConditionExpression:
      !hasAmbiguousMixedConnectors && isSupportedConditionExpression(parsed),
    traceComponents: toConditionTraceComponents(
      parsed,
      hasAmbiguousMixedConnectors,
    ),
    unsupportedConditionFragments: collectUnsupportedConditionFragments(parsed),
    unsupportedSyntaxFragments: hasAmbiguousMixedConnectors
      ? ["condition-boundary:ambiguous-mixed-connectors"]
      : collectUnsupportedConditionSyntaxFragments(parsed),
  };
}

function parseConditionConnectorCandidates(
  sourceText: string,
  baseOffset: number,
): readonly ConnectorCandidate[] {
  const candidates: ConnectorCandidate[] = [];
  const matcher = /\s(and|or)\s/gi;
  for (const match of sourceText.matchAll(matcher)) {
    const connectorText = match[1]?.toLowerCase();
    if (connectorText !== "and" && connectorText !== "or") {
      continue;
    }

    const connectorStart = match.index + 1;
    const connectorEnd = connectorStart + connectorText.length;
    const left = sourceText.slice(0, connectorStart).trim();
    const right = sourceText.slice(connectorEnd).trim();
    if (
      left.length === 0 ||
      right.length === 0 ||
      /^(more|less)\b/i.test(right)
    ) {
      continue;
    }

    candidates.push({
      connector: connectorText,
      connectorEnd: baseOffset + connectorEnd,
      connectorStart: baseOffset + connectorStart,
      left,
      leftStart: baseOffset + sourceText.indexOf(left),
      right,
      rightStart: baseOffset + sourceText.lastIndexOf(right),
    });
  }

  return candidates;
}

function parseConditionComponent(
  sourceText: string,
): ParsedConditionComponent | undefined {
  if (/^during your turn$/i.test(sourceText)) {
    return { type: "yourTurn" };
  }

  const attachedDonMatch =
    /^this Character has (\d+) or more DON!! cards attached$/i.exec(sourceText);
  if (attachedDonMatch !== null) {
    const value = parseExactPositiveSafeInteger(attachedDonMatch[1] ?? "");
    if (value !== undefined) {
      return {
        op: "gte",
        target: { type: "self" },
        type: "attachedDonCount",
        value,
      };
    }
  }

  if (/^your Leader is multicolored$/i.test(sourceText)) {
    return { op: "gte", player: "self", type: "leaderColorCount", value: 2 };
  }

  const leaderTypeMatch = /^your Leader has (?:the )?\{([^}]+)\} type$/i.exec(
    sourceText,
  );
  if (leaderTypeMatch !== null) {
    const leaderType = leaderTypeMatch[1]?.trim();
    if (leaderType !== undefined && leaderType.length > 0) {
      return {
        filter: { categories: ["leader"], typesAny: [leaderType] },
        player: "self",
        type: "hasCardInZone",
        zone: "leaderArea",
      };
    }
  }

  const leaderAttributeMatch =
    /^your Leader has (?:the )?\[([^\]]+)\] attribute$/i.exec(sourceText);
  if (leaderAttributeMatch !== null) {
    const attributeRaw = leaderAttributeMatch[1]?.trim().toLowerCase();
    if (attributeRaw !== undefined && attributeRaw.length > 0) {
      return {
        filter: { attributesAny: [attributeRaw], categories: ["leader"] },
        player: "self",
        type: "hasCardInZone",
        zone: "leaderArea",
      };
    }
  }

  const countMatch =
    /^(you|your opponent) (?:have|has) (\d+) or (more|less) (cards in your hand|cards in their hand|Life cards)$/i.exec(
      sourceText,
    );
  if (countMatch === null) {
    return undefined;
  }

  const playerText = countMatch[1]?.toLowerCase();
  const value = parseExactPositiveSafeInteger(countMatch[2] ?? "");
  const comparatorText = countMatch[3]?.toLowerCase();
  const zoneText = countMatch[4]?.toLowerCase();
  if (
    value === undefined ||
    (playerText !== "you" && playerText !== "your opponent") ||
    (comparatorText !== "more" && comparatorText !== "less") ||
    (zoneText !== "cards in your hand" &&
      zoneText !== "cards in their hand" &&
      zoneText !== "life cards") ||
    (playerText === "you" && zoneText === "cards in their hand") ||
    (playerText === "your opponent" && zoneText === "cards in your hand")
  ) {
    return undefined;
  }

  return {
    op: comparatorText === "more" ? "gte" : "lte",
    player: playerText === "you" ? "self" : "opponent",
    type: zoneText === "life cards" ? "lifeCount" : "handCount",
    value,
  };
}

function parseExactPositiveSafeInteger(countText: string): number | undefined {
  const count = Number.parseInt(countText, 10);
  if (!Number.isSafeInteger(count) || count <= 0) {
    return undefined;
  }

  if (countText !== String(count)) {
    return undefined;
  }

  return count;
}

function isSupportedConditionExpression(
  expression: ConditionExpressionParse,
): boolean {
  switch (expression.type) {
    case "supported":
      return true;
    case "connector":
      return (
        isSupportedConditionExpression(expression.left) &&
        isSupportedConditionExpression(expression.right)
      );
    case "unsupported-fragment":
      return false;
  }
}

function hasAnySupportedConditionComponent(
  expression: ConditionExpressionParse,
): boolean {
  switch (expression.type) {
    case "supported":
      return true;
    case "connector":
      return (
        hasAnySupportedConditionComponent(expression.left) ||
        hasAnySupportedConditionComponent(expression.right)
      );
    case "unsupported-fragment":
      return false;
  }
}

function hasMixedConnectors(expression: ConditionExpressionParse): boolean {
  switch (expression.type) {
    case "supported":
    case "unsupported-fragment":
      return false;
    case "connector": {
      const seen = new Set<"and" | "or">();
      collectConnectors(expression, seen);
      return seen.size > 1;
    }
  }
}

function collectConnectors(
  expression: ConditionExpressionParse,
  seen: Set<"and" | "or">,
): void {
  if (expression.type !== "connector") {
    return;
  }
  seen.add(expression.connector);
  collectConnectors(expression.left, seen);
  collectConnectors(expression.right, seen);
}

function toConditionTraceComponents(
  expression: ConditionExpressionParse,
  forceUnsupportedConnectors: boolean,
): readonly GeneratedSupportDiagnosticTraceComponent[] {
  switch (expression.type) {
    case "supported":
      return [
        {
          id: expression.id,
          kind: "condition",
          span: expression.span,
          status: "supported",
          text: expression.text,
        },
      ];
    case "connector":
      return [
        ...toConditionTraceComponents(
          expression.left,
          forceUnsupportedConnectors,
        ),
        {
          id: expression.id,
          kind: "condition-connector",
          span: expression.connectorSpan,
          status: forceUnsupportedConnectors
            ? "unsupported"
            : isSupportedConditionExpression(expression.left) &&
                isSupportedConditionExpression(expression.right)
              ? "supported"
              : "unsupported",
          text: expression.connector,
        },
        ...toConditionTraceComponents(
          expression.right,
          forceUnsupportedConnectors,
        ),
      ];
    case "unsupported-fragment":
      return [
        {
          id: expression.id,
          kind: "condition",
          span: expression.span,
          status: "unsupported",
          text: expression.text,
        },
      ];
  }
}

function collectUnsupportedConditionFragments(
  expression: ConditionExpressionParse,
): readonly string[] {
  switch (expression.type) {
    case "supported":
      return [];
    case "connector":
      return [
        ...collectUnsupportedConditionFragments(expression.left),
        ...collectUnsupportedConditionFragments(expression.right),
      ];
    case "unsupported-fragment":
      return [expression.text];
  }
}

function collectUnsupportedConditionSyntaxFragments(
  expression: ConditionExpressionParse,
): readonly string[] {
  switch (expression.type) {
    case "supported":
      return [];
    case "connector":
      return isSupportedConditionExpression(expression.left) &&
        isSupportedConditionExpression(expression.right)
        ? []
        : [
            `condition conjunction: ${expression.connector}`,
            ...collectUnsupportedConditionSyntaxFragments(expression.left),
            ...collectUnsupportedConditionSyntaxFragments(expression.right),
          ];
    case "unsupported-fragment":
      return ["condition-fragment:unsupported"];
  }
}

function toConditionComponentId(component: ParsedConditionComponent): string {
  switch (component.type) {
    case "yourTurn":
      return "condition:yourTurn";
    case "attachedDonCount":
      return `condition:attachedDonCount:self:${component.op}:${String(component.value)}`;
    case "leaderColorCount":
      return `condition:leaderColorCount:self:${component.op}:${String(component.value)}`;
    case "hasCardInZone":
      if ("typesAny" in component.filter) {
        return `condition:leaderType:${component.filter.typesAny[0]}`;
      }
      return `condition:leaderAttribute:${component.filter.attributesAny[0]}`;
    case "handCount":
    case "lifeCount":
      return `condition:${component.type}:${component.player}:${component.op}:${String(component.value)}`;
  }
}

function toConnectorId(candidate: ConnectorCandidate): string {
  return `condition-connector:${candidate.connector}:${String(candidate.connectorStart)}-${String(candidate.connectorEnd)}`;
}
