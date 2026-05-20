import type {
  GeneratedSupportDiagnosticDecomposition,
  GeneratedSupportDiagnosticTraceComponent,
  GeneratedSupportUnparsedSpan,
} from "./generated-support-types.js";

type ProtectionBodyDiagnostics = {
  readonly hasSupportedProtectionComponents: boolean;
  readonly isFullySupportedProtectionBody: boolean;
  readonly traceComponents: readonly GeneratedSupportDiagnosticTraceComponent[];
  readonly unsupportedSyntaxFragments: readonly string[];
};

type ProtectionComponentTrace = GeneratedSupportDiagnosticTraceComponent & {
  readonly id: string;
  readonly span: GeneratedSupportUnparsedSpan;
};

export type ParsedProtectionBody =
  | {
      readonly fieldZone: {
        readonly component: {
          readonly from: "field";
          readonly type: "fieldZone";
        };
        readonly id: string;
        readonly span: GeneratedSupportUnparsedSpan;
        readonly text: string;
      };
      readonly id: string;
      readonly protectedObject: {
        readonly component: {
          readonly category: "character";
          readonly type: "self";
        };
        readonly id: string;
        readonly span: GeneratedSupportUnparsedSpan;
        readonly text: string;
      };
      readonly removalProcess: {
        readonly component: {
          readonly process: "fieldRemoval";
          readonly type: "preventedProcess";
        };
        readonly id: string;
        readonly span: GeneratedSupportUnparsedSpan;
        readonly text: string;
      };
      readonly sourceController: {
        readonly component: {
          readonly controller: "opponent";
          readonly type: "sourceController";
        };
        readonly id: string;
        readonly span: GeneratedSupportUnparsedSpan;
        readonly text: string;
      };
      readonly sourceKind: {
        readonly component: {
          readonly kind: "effects";
          readonly type: "sourceKind";
        };
        readonly id: string;
        readonly span: GeneratedSupportUnparsedSpan;
        readonly text: string;
      };
      readonly span: GeneratedSupportUnparsedSpan;
      readonly text: string;
      readonly type: "supported";
    }
  | {
      readonly id: string;
      readonly span: GeneratedSupportUnparsedSpan;
      readonly text: string;
      readonly type: "unsupported-fragment";
    };

type ProtectionParseTrace = {
  readonly parsed: ParsedProtectionBody;
  readonly traceComponents: readonly ProtectionComponentTrace[];
};

export function parseProtectionBody(sourceText: string): ParsedProtectionBody {
  return parseProtectionBodyWithTrace(sourceText).parsed;
}

export function deriveProtectionBodyDiagnostics(
  bodyText: string,
): ProtectionBodyDiagnostics {
  const parsed = parseProtectionBodyWithTrace(bodyText);
  return {
    hasSupportedProtectionComponents: parsed.traceComponents.some(
      (component) => component.status === "supported",
    ),
    isFullySupportedProtectionBody: parsed.parsed.type === "supported",
    traceComponents: parsed.traceComponents,
    unsupportedSyntaxFragments:
      parsed.parsed.type === "supported"
        ? []
        : ["protection-fragment:unsupported"],
  };
}

export function deriveProtectionBodyDiagnosticDecomposition(
  sourceText: string,
): GeneratedSupportDiagnosticDecomposition | undefined {
  if (!looksLikeProtectionBody(sourceText)) {
    return undefined;
  }

  const diagnostics = deriveProtectionBodyDiagnostics(sourceText);
  const normalized = sourceText.trim();
  return {
    recognizedActionCandidates: [normalized],
    recognizedSyntaxFragments: [
      "protection-components:v1",
      ...(diagnostics.isFullySupportedProtectionBody
        ? ["protection:opponent-effect-field-removal"]
        : []),
    ],
    recognizedTriggerCandidates: [],
    reason: diagnostics.isFullySupportedProtectionBody
      ? "Opponent-effect field-removal protection components were recognized, but generated support remains fail-closed until schema/runtime bridge evidence represents this continuous protection component."
      : "Protection syntax was recognized, but one or more components remain unsupported; generated support remains fail-closed.",
    traceComponents: diagnostics.traceComponents,
    unsupportedConditionFragments: [],
    unsupportedSyntaxFragments: diagnostics.isFullySupportedProtectionBody
      ? ["protection:schema-runtime-bridge-missing"]
      : diagnostics.unsupportedSyntaxFragments,
  };
}

function looksLikeProtectionBody(bodyText: string): boolean {
  return /\bcannot be removed\b/i.test(bodyText);
}

function parseProtectionBodyWithTrace(
  sourceText: string,
): ProtectionParseTrace {
  const normalized = sourceText.trim();
  const trimmedStart = sourceText.indexOf(normalized);
  const absoluteStart = Math.max(trimmedStart, 0);
  const wholeSpan = toSpan(normalized, absoluteStart);
  const traceComponents: ProtectionComponentTrace[] = [];
  let cursor = 0;

  const protectedObjectMatch = /^this Character\b/i.exec(normalized);
  if (protectedObjectMatch === null) {
    return unsupportedProtectionTrace({
      absoluteStart,
      idPrefix: "protection:unsupported-protected-object",
      kind: "target",
      normalized,
      spanEnd: findProtectionBoundary(normalized, 0, /\s+cannot\b/i),
      spanStart: 0,
      traceComponents,
    });
  }

  const protectedObjectText = protectedObjectMatch[0];
  const protectedObjectSpan = toSpan(protectedObjectText, absoluteStart);
  const protectedObject = {
    component: { category: "character", type: "self" },
    id: "protection:protected-object:self-character",
    span: protectedObjectSpan,
    text: protectedObjectText,
  } as const;
  traceComponents.push({
    id: protectedObject.id,
    kind: "target",
    span: protectedObject.span,
    status: "supported",
    text: protectedObject.text,
  });
  cursor = protectedObjectText.length;

  const processStart = findNextNonWhitespaceIndex(normalized, cursor);
  if (processStart === undefined) {
    return unsupportedProtectionTrace({
      absoluteStart,
      idPrefix: "protection:unsupported-removal-process",
      kind: "action",
      normalized,
      spanEnd: cursor,
      spanStart: cursor,
      traceComponents,
    });
  }

  const removalProcessMatch = /^cannot be removed\b/i.exec(
    normalized.slice(processStart),
  );
  if (removalProcessMatch === null) {
    return unsupportedProtectionTrace({
      absoluteStart,
      idPrefix: "protection:unsupported-removal-process",
      kind: "action",
      normalized,
      spanEnd: findProtectionBoundary(normalized, processStart, /\s+from\b/i),
      spanStart: processStart,
      traceComponents,
    });
  }

  const removalProcessText = removalProcessMatch[0];
  const removalProcess = {
    component: { process: "fieldRemoval", type: "preventedProcess" },
    id: "protection:removal-process:field-removal",
    span: toSpan(removalProcessText, absoluteStart + processStart),
    text: removalProcessText,
  } as const;
  traceComponents.push({
    id: removalProcess.id,
    kind: "action",
    span: removalProcess.span,
    status: "supported",
    text: removalProcess.text,
  });
  cursor = processStart + removalProcessText.length;

  const fieldZoneStart = findNextNonWhitespaceIndex(normalized, cursor);
  if (fieldZoneStart === undefined) {
    return unsupportedProtectionTrace({
      absoluteStart,
      idPrefix: "protection:unsupported-field-zone",
      kind: "destination",
      normalized,
      spanEnd: cursor,
      spanStart: cursor,
      traceComponents,
    });
  }

  const fieldZoneMatch = /^from the field\b/i.exec(
    normalized.slice(fieldZoneStart),
  );
  if (fieldZoneMatch === null) {
    return unsupportedProtectionTrace({
      absoluteStart,
      idPrefix: "protection:unsupported-field-zone",
      kind: "destination",
      normalized,
      spanEnd: findProtectionBoundary(normalized, fieldZoneStart, /\s+by\b/i),
      spanStart: fieldZoneStart,
      traceComponents,
    });
  }

  const fieldZoneText = fieldZoneMatch[0];
  const fieldZone = {
    component: { from: "field", type: "fieldZone" },
    id: "protection:field-zone:field",
    span: toSpan(fieldZoneText, absoluteStart + fieldZoneStart),
    text: fieldZoneText,
  } as const;
  traceComponents.push({
    id: fieldZone.id,
    kind: "destination",
    span: fieldZone.span,
    status: "supported",
    text: fieldZone.text,
  });
  cursor = fieldZoneStart + fieldZoneText.length;

  const byStart = findNextNonWhitespaceIndex(normalized, cursor);
  const byText =
    byStart === undefined
      ? undefined
      : /^by\b/i.exec(normalized.slice(byStart))?.[0];
  const controllerStart =
    byStart === undefined || byText === undefined
      ? undefined
      : findNextNonWhitespaceIndex(normalized, byStart + byText.length);
  if (controllerStart === undefined) {
    const unsupportedStart = byStart ?? cursor;
    return unsupportedProtectionTrace({
      absoluteStart,
      idPrefix: "protection:unsupported-source-controller",
      kind: "predicate",
      normalized,
      spanEnd:
        byStart !== undefined && byText === undefined
          ? normalized.length
          : unsupportedStart,
      spanStart: unsupportedStart,
      traceComponents,
    });
  }

  const sourceControllerMatch = /^your opponent(?='s\b)/i.exec(
    normalized.slice(controllerStart),
  );
  if (sourceControllerMatch === null) {
    return unsupportedProtectionTrace({
      absoluteStart,
      idPrefix: "protection:unsupported-source-controller",
      kind: "predicate",
      normalized,
      spanEnd: findProtectionBoundary(
        normalized,
        controllerStart,
        /\s|(?='s\b)/i,
      ),
      spanStart: controllerStart,
      traceComponents,
    });
  }

  const sourceControllerText = sourceControllerMatch[0];
  const sourceController = {
    component: { controller: "opponent", type: "sourceController" },
    id: "protection:source-controller:opponent",
    span: toSpan(sourceControllerText, absoluteStart + controllerStart),
    text: sourceControllerText,
  } as const;
  traceComponents.push({
    id: sourceController.id,
    kind: "predicate",
    span: sourceController.span,
    status: "supported",
    text: sourceController.text,
  });
  cursor = controllerStart + sourceControllerText.length + "'s".length;

  const sourceKindStart = findNextNonWhitespaceIndex(normalized, cursor);
  if (sourceKindStart === undefined) {
    return unsupportedProtectionTrace({
      absoluteStart,
      idPrefix: "protection:unsupported-source-kind",
      kind: "predicate",
      normalized,
      spanEnd: cursor,
      spanStart: cursor,
      traceComponents,
    });
  }

  const sourceKindMatch = /^effects?\b/i.exec(
    normalized.slice(sourceKindStart),
  );
  if (sourceKindMatch === null) {
    return unsupportedProtectionTrace({
      absoluteStart,
      idPrefix: "protection:unsupported-source-kind",
      kind: "predicate",
      normalized,
      spanEnd: findProtectionBoundary(normalized, sourceKindStart, /\s/i),
      spanStart: sourceKindStart,
      traceComponents,
    });
  }

  const sourceKindText = sourceKindMatch[0];
  const sourceKind = {
    component: { kind: "effects", type: "sourceKind" },
    id: "protection:source-kind:effects",
    span: toSpan(sourceKindText, absoluteStart + sourceKindStart),
    text: sourceKindText,
  } as const;
  traceComponents.push({
    id: sourceKind.id,
    kind: "predicate",
    span: sourceKind.span,
    status: "supported",
    text: sourceKind.text,
  });
  cursor = sourceKindStart + sourceKindText.length;

  const residueStart = findNextNonWhitespaceIndex(normalized, cursor);
  if (residueStart !== undefined) {
    return unsupportedProtectionTrace({
      absoluteStart,
      idPrefix: "protection:unsupported-residue",
      kind: "predicate",
      normalized,
      spanEnd: normalized.length,
      spanStart: residueStart,
      traceComponents,
    });
  }

  return {
    parsed: {
      fieldZone,
      id: "protection:self-character:cannot-be-removed:field:opponent-effects",
      protectedObject,
      removalProcess,
      sourceController,
      sourceKind,
      span: wholeSpan,
      text: normalized,
      type: "supported",
    },
    traceComponents,
  };
}

function unsupportedProtectionTrace({
  absoluteStart,
  idPrefix,
  kind,
  normalized,
  spanEnd,
  spanStart,
  traceComponents,
}: {
  readonly absoluteStart: number;
  readonly idPrefix: string;
  readonly kind: ProtectionComponentTrace["kind"];
  readonly normalized: string;
  readonly spanEnd: number;
  readonly spanStart: number;
  readonly traceComponents: readonly ProtectionComponentTrace[];
}): ProtectionParseTrace {
  const span = toSpan(
    normalized.slice(spanStart, spanEnd),
    absoluteStart + spanStart,
  );
  const id = `${idPrefix}:${String(span.start)}-${String(span.end)}`;
  return {
    parsed: {
      id,
      span,
      text: normalized,
      type: "unsupported-fragment",
    },
    traceComponents: [
      ...traceComponents,
      {
        id,
        kind,
        span,
        status: "unsupported",
        text: span.text,
      },
    ],
  };
}

function findProtectionBoundary(
  sourceText: string,
  start: number,
  boundary: RegExp,
): number {
  const match = boundary.exec(sourceText.slice(start));
  return match === null ? sourceText.length : start + match.index;
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

function toSpan(text: string, start: number): GeneratedSupportUnparsedSpan {
  return {
    end: start + text.length,
    start,
    text,
  };
}
