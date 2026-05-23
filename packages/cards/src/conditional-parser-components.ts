import type {
  GeneratedSupportDiagnosticDecomposition,
  GeneratedSupportDiagnosticTraceComponent,
  GeneratedSupportUnparsedSpan,
} from "./generated-support-types.js";
import { toConditionConnectorId } from "./conditional-parser-id-helpers.js";

export {
  deriveProtectionBodyDiagnosticDecomposition,
  deriveProtectionBodyDiagnostics,
  parseProtectionBody,
  type ParsedProtectionBody,
} from "./protection-diagnostic-components.js";

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
    }
  | {
      readonly op: "eq" | "gte" | "lte";
      readonly filter: {
        readonly categories: readonly ["don"];
      };
      readonly player: "self" | "opponent";
      readonly type: "fieldCount";
      readonly value: number;
    }
  | {
      readonly op: "eq" | "gte" | "lte";
      readonly player: "self" | "opponent";
      readonly type: "trashCount";
      readonly value: number;
    };

export type ConditionalKeywordGrantKeyword =
  | "banish"
  | "blocker"
  | "doubleAttack"
  | "rush"
  | "rushCharacter";

export type ParsedKeywordGrantBody =
  | {
      readonly id: string;
      readonly keyword: {
        readonly component: {
          readonly keyword: ConditionalKeywordGrantKeyword;
          readonly type: "keywordToken";
        };
        readonly id: string;
        readonly span: GeneratedSupportUnparsedSpan;
        readonly text: string;
      };
      readonly span: GeneratedSupportUnparsedSpan;
      readonly target: {
        readonly component: {
          readonly category: "character";
          readonly type: "self";
        };
        readonly id: string;
        readonly span: GeneratedSupportUnparsedSpan;
        readonly text: string;
      };
      readonly text: string;
      readonly type: "supported";
      readonly verb: {
        readonly component: { readonly type: "gains" };
        readonly id: string;
        readonly span: GeneratedSupportUnparsedSpan;
        readonly text: string;
      };
    }
  | {
      readonly id: string;
      readonly span: GeneratedSupportUnparsedSpan;
      readonly text: string;
      readonly type: "unsupported-fragment";
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

type KeywordGrantDiagnostics = {
  readonly hasSupportedKeywordGrantComponents: boolean;
  readonly isFullySupportedKeywordGrantBody: boolean;
  readonly traceComponents: readonly GeneratedSupportDiagnosticTraceComponent[];
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

  if (/^you and your opponent\b/i.test(normalized)) {
    return {
      id: `condition:unsupported:${String(absoluteStart)}-${String(absoluteEnd)}`,
      span,
      text: normalized,
      type: "unsupported-fragment",
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
        id: toConditionConnectorId(connector),
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
    id: toConditionConnectorId(fallback),
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

export function parseKeywordGrantBody(
  sourceText: string,
): ParsedKeywordGrantBody {
  const normalized = sourceText.trim();
  const trimmedStart = sourceText.indexOf(normalized);
  const absoluteStart = Math.max(trimmedStart, 0);
  const span = toSpan(normalized, absoluteStart);

  const targetMatch = /^this Character\b/i.exec(normalized);
  const gainsMatch = /\bgains\b/i.exec(normalized);
  const supportedTargetEnd = targetMatch?.[0].length;
  if (supportedTargetEnd === undefined) {
    const unsupportedTargetEnd = findUnsupportedTargetEnd(normalized);
    return toUnsupportedKeywordGrantFragment({
      idPrefix: "keyword-grant:unsupported-target",
      normalized,
      span: toSpan(normalized.slice(0, unsupportedTargetEnd), absoluteStart),
    });
  }

  const targetText = normalized.slice(0, supportedTargetEnd);
  const verbStart = findNextNonWhitespaceIndex(normalized, supportedTargetEnd);
  const verbMatch =
    verbStart === undefined
      ? undefined
      : /^\S+/.exec(normalized.slice(verbStart));
  const verbText = verbMatch?.[0];
  if (verbStart === undefined || verbText === undefined) {
    return toUnsupportedKeywordGrantFragment({
      idPrefix: "keyword-grant:unsupported-verb",
      normalized,
      span: toSpan("", absoluteStart + supportedTargetEnd),
    });
  }
  if (gainsMatch === null || gainsMatch.index !== verbStart) {
    return toUnsupportedKeywordGrantFragment({
      idPrefix: "keyword-grant:unsupported-verb",
      normalized,
      span: toSpan(verbText, absoluteStart + verbStart),
    });
  }

  const keywordStart = findNextNonWhitespaceIndex(
    normalized,
    verbStart + verbText.length,
  );
  if (keywordStart === undefined) {
    const missingKeywordStart = absoluteStart + normalized.length;
    return toUnsupportedKeywordGrantFragment({
      idPrefix: "keyword-grant:missing-keyword",
      normalized,
      span: { end: missingKeywordStart, start: missingKeywordStart, text: "" },
    });
  }

  const keywordTextMatch = /^\[[^\]]+\]/.exec(normalized.slice(keywordStart));
  const keywordText = keywordTextMatch?.[0];
  if (keywordText === undefined) {
    return toUnsupportedKeywordGrantFragment({
      idPrefix: "keyword-grant:unsupported-keyword",
      normalized,
      span: toSpan(
        normalized.slice(keywordStart),
        absoluteStart + keywordStart,
      ),
    });
  }

  const keyword = parseKeywordGrantToken(keywordText);
  if (keyword === undefined) {
    return toUnsupportedKeywordGrantFragment({
      idPrefix: "keyword-grant:unsupported-keyword",
      normalized,
      span: toSpan(keywordText, absoluteStart + keywordStart),
    });
  }

  const residueStart = findNextNonWhitespaceIndex(
    normalized,
    keywordStart + keywordText.length,
  );
  if (residueStart !== undefined) {
    return toUnsupportedKeywordGrantFragment({
      idPrefix: "keyword-grant:unsupported-residue",
      normalized,
      span: toSpan(
        normalized.slice(residueStart),
        absoluteStart + residueStart,
      ),
    });
  }

  return {
    id: `keyword-grant:self-character:gains:${keyword}`,
    keyword: {
      component: { keyword, type: "keywordToken" },
      id: `keyword-grant:keyword:${keyword}`,
      span: toSpan(keywordText, absoluteStart + keywordStart),
      text: keywordText,
    },
    span,
    target: {
      component: { category: "character", type: "self" },
      id: "keyword-grant:target:self-character",
      span: toSpan(targetText, absoluteStart),
      text: targetText,
    },
    text: normalized,
    type: "supported",
    verb: {
      component: { type: "gains" },
      id: "keyword-grant:verb:gains",
      span: toSpan(verbText, absoluteStart + verbStart),
      text: verbText,
    },
  };
}

export function deriveConditionalKeywordGrantDiagnostics(
  bodyText: string,
): KeywordGrantDiagnostics {
  const parsed = parseKeywordGrantBody(bodyText);
  if (parsed.type === "unsupported-fragment") {
    return {
      hasSupportedKeywordGrantComponents: false,
      isFullySupportedKeywordGrantBody: false,
      traceComponents: [
        {
          id: parsed.id,
          kind: "keyword",
          span: parsed.span,
          status: "unsupported",
          text: parsed.span.text,
        },
      ],
      unsupportedSyntaxFragments: ["keyword-grant-fragment:unsupported"],
    };
  }

  return {
    hasSupportedKeywordGrantComponents: true,
    isFullySupportedKeywordGrantBody: true,
    traceComponents: [
      {
        id: parsed.target.id,
        kind: "target",
        span: parsed.target.span,
        status: "supported",
        text: parsed.target.text,
      },
      {
        id: parsed.verb.id,
        kind: "verb",
        span: parsed.verb.span,
        status: "supported",
        text: parsed.verb.text,
      },
      {
        id: parsed.keyword.id,
        kind: "keyword",
        span: parsed.keyword.span,
        status: "supported",
        text: parsed.keyword.text,
      },
    ],
    unsupportedSyntaxFragments: [],
  };
}

export function deriveConditionalKeywordGrantDiagnosticDecomposition(
  sourceText: string,
): GeneratedSupportDiagnosticDecomposition | undefined {
  const conditional = parseIfDiagnosticWrapper(sourceText);
  if (conditional === undefined) {
    return undefined;
  }

  const conditionDiagnostics = deriveConditionalConditionDiagnostics(
    conditional.conditionText,
  );
  const keywordGrantDiagnostics = deriveConditionalKeywordGrantDiagnostics(
    conditional.bodyText,
  );
  if (
    !keywordGrantDiagnostics.hasSupportedKeywordGrantComponents &&
    !looksLikeKeywordGrantBody(conditional.bodyText)
  ) {
    return undefined;
  }

  return {
    recognizedActionCandidates: [conditional.bodyText],
    recognizedSyntaxFragments: [
      "if-conditional-wrapper",
      ...(conditionDiagnostics.hasSupportedConditionComponents
        ? ["condition-components:v1"]
        : []),
      ...(keywordGrantDiagnostics.hasSupportedKeywordGrantComponents
        ? ["keyword-grant-components:v1"]
        : []),
    ],
    recognizedTriggerCandidates: [],
    reason:
      conditionDiagnostics.isFullySupportedConditionExpression &&
      keywordGrantDiagnostics.isFullySupportedKeywordGrantBody
        ? "Conditional keyword-grant components were recognized, but generated support remains fail-closed until schema/runtime bridge evidence represents this continuous component."
        : "Conditional keyword-grant syntax was recognized, but one or more components remain unsupported; generated support remains fail-closed.",
    traceComponents: [
      { kind: "wrapper", status: "recognized", text: "If" },
      ...conditionDiagnostics.traceComponents,
      ...offsetTraceComponentSpans(
        keywordGrantDiagnostics.traceComponents,
        conditional.bodyTextStart,
      ),
    ],
    unsupportedConditionFragments:
      conditionDiagnostics.unsupportedConditionFragments,
    unsupportedSyntaxFragments:
      conditionDiagnostics.isFullySupportedConditionExpression &&
      keywordGrantDiagnostics.isFullySupportedKeywordGrantBody
        ? ["conditional-keyword-grant:schema-runtime-bridge-missing"]
        : [
            ...conditionDiagnostics.unsupportedSyntaxFragments,
            ...keywordGrantDiagnostics.unsupportedSyntaxFragments,
          ],
  };
}

export function deriveConditionalDiagnosticDecomposition(
  sourceText: string,
): GeneratedSupportDiagnosticDecomposition | undefined {
  return (
    deriveConditionalKeywordGrantDiagnosticDecomposition(sourceText) ??
    deriveConditionalDrawDiagnosticDecomposition(sourceText)
  );
}

function deriveConditionalDrawDiagnosticDecomposition(
  sourceText: string,
): GeneratedSupportDiagnosticDecomposition | undefined {
  const prefix = "[On Play] ";
  if (!sourceText.startsWith(prefix)) {
    return undefined;
  }

  const conditional = parseIfDiagnosticWrapper(sourceText.slice(prefix.length));
  const drawCandidate =
    conditional === undefined
      ? undefined
      : /^(draw\s+[1-9]\d*\s+cards?)$/i.exec(conditional.bodyText)?.[1]?.trim();
  if (conditional === undefined || drawCandidate === undefined) {
    return undefined;
  }

  const conditionDiagnostics = deriveConditionalConditionDiagnostics(
    conditional.conditionText,
  );

  return {
    recognizedActionCandidates: [drawCandidate],
    recognizedSyntaxFragments:
      conditionDiagnostics.hasSupportedConditionComponents
        ? ["if-conditional-wrapper", "condition-components:v1"]
        : ["if-conditional-wrapper"],
    recognizedTriggerCandidates: [prefix.trim()],
    reason: conditionDiagnostics.isFullySupportedConditionExpression
      ? "Conditional wrapper and supported condition components were recognized, but conditional generated support remains fail-closed until conditional runtime capability evidence is represented."
      : "Conditional wrapper syntax was recognized, but one or more condition fragments remain unsupported; generated support remains fail-closed.",
    traceComponents: [
      { kind: "trigger", status: "recognized", text: prefix.trim() },
      { kind: "wrapper", status: "recognized", text: "If" },
      ...conditionDiagnostics.traceComponents,
      {
        kind: "action",
        status: "supported",
        text: drawCandidate,
      },
    ],
    unsupportedConditionFragments:
      conditionDiagnostics.unsupportedConditionFragments,
    unsupportedSyntaxFragments:
      conditionDiagnostics.isFullySupportedConditionExpression
        ? ["conditional-support:runtime-capability-evidence-missing"]
        : conditionDiagnostics.unsupportedSyntaxFragments,
  };
}

function parseIfDiagnosticWrapper(sourceText: string):
  | {
      readonly bodyText: string;
      readonly bodyTextStart: number;
      readonly conditionText: string;
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
  };
}

function looksLikeKeywordGrantBody(bodyText: string): boolean {
  return /^this Character\s+(?:gains|gets)\s+\[[^\]]+\]/i.test(bodyText);
}

function offsetTraceComponentSpans(
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
      /^(fewer|less|more)\b/i.test(right)
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
  if (countMatch !== null) {
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

  const fieldCountMatch =
    /^(you|your opponent) (?:have|has) (\d+)(?: or (more|less))? DON!! cards on (your|their) field$/i.exec(
      sourceText,
    );
  if (fieldCountMatch !== null) {
    const playerText = fieldCountMatch[1]?.toLowerCase();
    const valueText = fieldCountMatch[2] ?? "";
    const value =
      valueText === "0" ? 0 : parseExactPositiveSafeInteger(valueText);
    const comparatorText = fieldCountMatch[3]?.toLowerCase();
    const fieldOwnerText = fieldCountMatch[4]?.toLowerCase();
    if (
      value === undefined ||
      (playerText !== "you" && playerText !== "your opponent") ||
      (fieldOwnerText !== "your" && fieldOwnerText !== "their") ||
      (comparatorText !== undefined &&
        comparatorText !== "more" &&
        comparatorText !== "less") ||
      (playerText === "you" && fieldOwnerText !== "your") ||
      (playerText === "your opponent" && fieldOwnerText !== "their")
    ) {
      return undefined;
    }

    return {
      filter: { categories: ["don"] },
      op:
        comparatorText === "more"
          ? "gte"
          : comparatorText === "less"
            ? "lte"
            : "eq",
      player: playerText === "you" ? "self" : "opponent",
      type: "fieldCount",
      value,
    };
  }

  const trashCountMatch =
    /^(you|your opponent) (?:have|has) (\d+)(?: or (more|less))? cards in (your|their) trash$/i.exec(
      sourceText,
    );
  if (trashCountMatch === null) {
    return undefined;
  }

  const playerText = trashCountMatch[1]?.toLowerCase();
  const value = parseExactPositiveSafeInteger(trashCountMatch[2] ?? "");
  const comparatorText = trashCountMatch[3]?.toLowerCase();
  const ownerText = trashCountMatch[4]?.toLowerCase();
  if (
    value === undefined ||
    (playerText !== "you" && playerText !== "your opponent") ||
    (ownerText !== "your" && ownerText !== "their") ||
    (comparatorText !== undefined &&
      comparatorText !== "more" &&
      comparatorText !== "less") ||
    (playerText === "you" && ownerText !== "your") ||
    (playerText === "your opponent" && ownerText !== "their")
  ) {
    return undefined;
  }

  return {
    op:
      comparatorText === "more"
        ? "gte"
        : comparatorText === "less"
          ? "lte"
          : "eq",
    player: playerText === "you" ? "self" : "opponent",
    type: "trashCount",
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

function parseKeywordGrantToken(
  keywordText: string,
): ConditionalKeywordGrantKeyword | undefined {
  switch (keywordText.toLowerCase()) {
    case "[banish]":
      return "banish";
    case "[blocker]":
      return "blocker";
    case "[double attack]":
      return "doubleAttack";
    case "[rush]":
      return "rush";
    case "[rush: character]":
      return "rushCharacter";
    default:
      return undefined;
  }
}

function findNextNonWhitespaceIndex(
  sourceText: string,
  start: number,
): number | undefined {
  for (let index = start; index < sourceText.length; index += 1) {
    if (!/\s/.test(sourceText[index] ?? "")) {
      return index;
    }
  }
  return undefined;
}

function findUnsupportedTargetEnd(sourceText: string): number {
  const grantVerb = /\s+(?:gains|gets)\b/i.exec(sourceText);
  if (grantVerb !== null) {
    return grantVerb.index;
  }

  const keyword = /\s+\[[^\]]+\]/.exec(sourceText);
  if (keyword !== null) {
    return keyword.index;
  }

  return sourceText.length;
}

function toUnsupportedKeywordGrantFragment({
  idPrefix,
  normalized,
  span,
}: {
  readonly idPrefix: string;
  readonly normalized: string;
  readonly span: GeneratedSupportUnparsedSpan;
}): ParsedKeywordGrantBody {
  return {
    id: `${idPrefix}:${String(span.start)}-${String(span.end)}`,
    span,
    text: normalized,
    type: "unsupported-fragment",
  };
}

function toSpan(text: string, start: number): GeneratedSupportUnparsedSpan {
  return {
    end: start + text.length,
    start,
    text,
  };
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
    case "fieldCount":
    case "trashCount":
      return component.type === "fieldCount"
        ? `condition:fieldCount:don:${component.player}:${component.op}:${String(component.value)}`
        : `condition:${component.type}:${component.player}:${component.op}:${String(component.value)}`;
  }
}
