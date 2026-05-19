import type {
  GeneratedSupportDiagnosticTraceComponentKind,
  GeneratedSupportDiagnosticTraceComponentStatus,
  GeneratedSupportUnparsedSpan,
} from "./generated-support-types.js";

export type GenericDiagnosticComponent = {
  id: string;
  kind: GeneratedSupportDiagnosticTraceComponentKind;
  normalizedText: string;
  span: GeneratedSupportUnparsedSpan;
  status: GeneratedSupportDiagnosticTraceComponentStatus;
  text: string;
};

export type GenericCardTextDiagnostics = {
  components: readonly GenericDiagnosticComponent[];
};

export function scanGenericCardTextDiagnostics(
  sourceText: string,
): GenericCardTextDiagnostics {
  const components: GenericDiagnosticComponent[] = [];
  const recognizedSpans: Array<{ end: number; start: number }> = [];

  const wrapperRegex = /\[[^\]]+\]/g;
  for (const match of sourceText.matchAll(wrapperRegex)) {
    const text = match[0];
    const start = match.index;
    const prevChar = start > 0 ? sourceText[start - 1] : "";
    const isBoundary =
      start === 0 ||
      prevChar === "/" ||
      prevChar === "\n" ||
      prevChar === "." ||
      prevChar === "(";
    if (!isBoundary) {
      continue;
    }
    const normalizedText = normalizeDiagnosticText(text);
    const status: GeneratedSupportDiagnosticTraceComponentStatus =
      /^\[activate:\s*main\]$/i.test(text) ? "unsupported" : "recognized";
    pushComponent(components, recognizedSpans, {
      kind: "wrapper",
      normalizedText,
      start,
      status,
      text,
    });
  }

  const leadingContinuous =
    /^(During your turn|On your opponent's turn),/i.exec(sourceText);
  if (leadingContinuous !== null) {
    const text = leadingContinuous[0].slice(0, -1);
    const start = sourceText.indexOf(text);
    pushComponent(components, recognizedSpans, {
      kind: "wrapper",
      normalizedText: normalizeDiagnosticText(text),
      start,
      status: "recognized",
      text,
    });
  }

  for (const match of sourceText.matchAll(/\bup to\s+\d+\b/gi)) {
    const text = match[0];
    pushComponent(components, recognizedSpans, {
      kind: "cardinality",
      normalizedText: normalizeDiagnosticText(text),
      start: match.index,
      status: "recognized",
      text,
    });
  }

  for (const match of sourceText.matchAll(
    /\b\d+\s+(power|cost)\s+or\s+(less|more)\b/gi,
  )) {
    const text = match[0];
    pushComponent(components, recognizedSpans, {
      kind: "predicate",
      normalizedText: normalizeDiagnosticText(text),
      start: match.index,
      status: "recognized",
      text,
    });
  }

  for (const match of sourceText.matchAll(/\bcost of \d+\b/gi)) {
    const text = match[0];
    pushComponent(components, recognizedSpans, {
      kind: "predicate",
      normalizedText: normalizeDiagnosticText(text),
      start: match.index,
      status: "recognized",
      text,
    });
  }

  for (const match of sourceText.matchAll(
    /\b\d+\s+or\s+(less|more)\s+cards?\b/gi,
  )) {
    const text = match[0];
    pushComponent(components, recognizedSpans, {
      kind: "predicate",
      normalizedText: normalizeDiagnosticText(text),
      start: match.index,
      status: "recognized",
      text,
    });
  }

  for (const match of sourceText.matchAll(/\b\d+\s+cards?\b/gi)) {
    const text = match[0];
    const before = sourceText
      .slice(Math.max(match.index - 6, 0), match.index)
      .toLowerCase();
    if (before.endsWith("up to ")) {
      continue;
    }
    pushComponent(components, recognizedSpans, {
      kind: "quantity",
      normalizedText: normalizeDiagnosticText(text),
      start: match.index,
      status: "recognized",
      text,
    });
  }

  for (const match of sourceText.matchAll(/\bDON!!\s+([-\u2212]\d+):/gi)) {
    const full = match[0];
    const costTextMatch = /([-\u2212]\d+):/i.exec(full);
    const costText = costTextMatch?.[1];
    if (costText === undefined) {
      continue;
    }
    const costStart = match.index + full.indexOf(costText);
    pushComponent(components, recognizedSpans, {
      kind: "cost",
      normalizedText: normalizeDiagnosticText(costText),
      start: costStart,
      status: "recognized",
      text: costText,
    });

    const colonStart = match.index + full.lastIndexOf(":");
    pushComponent(components, recognizedSpans, {
      kind: "cost",
      normalizedText: ":",
      start: colonStart,
      status: "recognized",
      text: ":",
    });
  }

  for (const match of sourceText.matchAll(/\bmay\b/gi)) {
    const text = match[0];
    pushComponent(components, recognizedSpans, {
      kind: "optionality",
      normalizedText: "optionality:may",
      start: match.index,
      status: "recognized",
      text,
    });
  }

  const ifBoundary = /\bIf\s+(.+?),/i.exec(sourceText);
  if (ifBoundary !== null) {
    const ifStart = ifBoundary.index;
    pushComponent(components, recognizedSpans, {
      kind: "condition",
      normalizedText: "if",
      start: ifStart,
      status: "recognized",
      text: "If",
    });

    const conditionBody = ifBoundary[1];
    if (conditionBody === undefined) {
      return {
        components: components.sort((left, right) => {
          if (left.span.start !== right.span.start) {
            return left.span.start - right.span.start;
          }
          if (left.span.end !== right.span.end) {
            return left.span.end - right.span.end;
          }
          return left.kind.localeCompare(right.kind);
        }),
      };
    }
    const bodyStart = ifStart + ifBoundary[0].indexOf(conditionBody);
    for (const segment of conditionBody.split(/\s+and\s+/i)) {
      const text = segment.trim();
      if (text.length === 0) {
        continue;
      }
      const start = bodyStart + conditionBody.indexOf(text);
      pushComponent(components, recognizedSpans, {
        kind: "condition",
        normalizedText: normalizeDiagnosticText(text),
        start,
        status: "recognized",
        text,
      });
    }

    for (const andMatch of conditionBody.matchAll(/\sand\s/gi)) {
      const start = bodyStart + andMatch.index + 1;
      pushComponent(components, recognizedSpans, {
        kind: "condition-connector",
        normalizedText: "and",
        start,
        status: "recognized",
        text: "and",
      });
    }
  }

  for (const match of sourceText.matchAll(/\bThen\b/g)) {
    pushComponent(components, recognizedSpans, {
      kind: "sequence",
      normalizedText: "sequence:then",
      start: match.index,
      status: "recognized",
      text: "Then",
    });
  }

  for (const pattern of [
    /\byour opponent's Character cards\b/gi,
    /\byour opponent's Characters\b/gi,
    /\byour DON!! cards\b/gi,
    /\byour hand\b/gi,
    /\bDON!! card\b/gi,
    /\bthis Character\b/gi,
    /\byour \{[^}]+\} type Characters\b/gi,
  ]) {
    for (const match of sourceText.matchAll(pattern)) {
      const text = match[0];
      pushComponent(components, recognizedSpans, {
        kind: "target",
        normalizedText: normalizeDiagnosticText(text),
        start: match.index,
        status: "recognized",
        text,
      });
    }
  }

  for (const pattern of [
    /\bnamed\s+[A-Za-z0-9'-]+\b/g,
    /\[[A-Za-z ]+\]\s+attribute/gi,
  ]) {
    for (const match of sourceText.matchAll(pattern)) {
      const text = match[0];
      pushComponent(components, recognizedSpans, {
        kind: "predicate",
        normalizedText: normalizeDiagnosticText(text),
        start: match.index,
        status: "recognized",
        text,
      });
    }
  }

  for (const pattern of [
    /\bplace\b/gi,
    /\bdraw\b/gi,
    /\btrash\b/gi,
    /\bset\b/gi,
    /K\.O\./g,
    /\bgains\b/gi,
    /\bcannot attack\b/gi,
  ]) {
    for (const match of sourceText.matchAll(pattern)) {
      const text = match[0];
      pushComponent(components, recognizedSpans, {
        kind: /cannot attack/i.test(text) ? "restriction" : "action",
        normalizedText: normalizeDiagnosticText(text),
        start: match.index,
        status: "recognized",
        text,
      });
    }
  }

  for (const pattern of [
    /\bbottom of the owner's deck\b/gi,
    /\bthis turn\b/gi,
    /\buntil the end of your opponent's next turn\b/gi,
  ]) {
    for (const match of sourceText.matchAll(pattern)) {
      const text = match[0];
      pushComponent(components, recognizedSpans, {
        kind:
          /this turn/i.test(text) || /until the end of/i.test(text)
            ? "duration"
            : "destination",
        normalizedText: normalizeDiagnosticText(text),
        start: match.index,
        status: "recognized",
        text,
      });
    }
  }

  for (const match of sourceText.matchAll(/\bmulticolored\b/gi)) {
    const text = match[0];
    pushComponent(components, recognizedSpans, {
      kind: "modifier",
      normalizedText: normalizeDiagnosticText(text),
      start: match.index,
      status: "recognized",
      text,
    });
  }

  for (const match of sourceText.matchAll(/[−-]\d+\s+cost/gi)) {
    const text = match[0];
    pushComponent(components, recognizedSpans, {
      kind: "modifier",
      normalizedText: normalizeDiagnosticText(text),
      start: match.index,
      status: "recognized",
      text,
    });
  }

  for (const match of sourceText.matchAll(/[+]\d+\s+power/gi)) {
    const text = match[0];
    pushComponent(components, recognizedSpans, {
      kind: "modifier",
      normalizedText: normalizeDiagnosticText(text),
      start: match.index,
      status: "recognized",
      text,
    });
  }

  for (const match of sourceText.matchAll(
    /\bset up to \d+ of your DON!! cards as active\b/gi,
  )) {
    pushComponent(components, recognizedSpans, {
      kind: "action",
      normalizedText: "set as active",
      start: match.index,
      status: "recognized",
      text: "set as active",
    });
  }

  for (const match of sourceText.matchAll(
    /\brest this Stage\b|\bturn 1 card from the top of your Life cards face-up\b/gi,
  )) {
    const text = match[0];
    pushComponent(components, recognizedSpans, {
      kind: "cost",
      normalizedText: normalizeDiagnosticText(text),
      start: match.index,
      status: "recognized",
      text,
    });
  }

  for (const match of sourceText.matchAll(/face-up:/gi)) {
    const text = ":";
    const start = match.index + "face-up".length;
    pushComponent(components, recognizedSpans, {
      kind: "cost",
      normalizedText: ":",
      start,
      status: "recognized",
      text,
    });
  }

  const scrubbedComparators = sourceText.replace(
    /\b\d+\s+(power|cost)\s+or\s+(less|more)\b|\b\d+\s+or\s+(less|more)\s+cards?\b/gi,
    " ",
  );
  for (const match of scrubbedComparators.matchAll(/\sor\s/gi)) {
    const index = match.index;
    pushComponent(components, recognizedSpans, {
      kind: "condition-connector",
      normalizedText: "or",
      start: index + 1,
      status: "recognized",
      text: "or",
    });
  }

  if (components.length === 0) {
    components.push(
      createComponent({
        kind: "action",
        normalizedText: normalizeDiagnosticText(sourceText),
        start: 0,
        status: "unsupported",
        text: sourceText,
      }),
    );
  } else {
    for (const span of extractResidueSpans(sourceText, recognizedSpans)) {
      components.push(
        createComponent({
          kind: "action",
          normalizedText: normalizeDiagnosticText(span.text),
          start: span.start,
          status: "unsupported",
          text: span.text,
        }),
      );
    }
  }

  return {
    components: components.sort((left, right) => {
      if (left.span.start !== right.span.start) {
        return left.span.start - right.span.start;
      }
      if (left.span.end !== right.span.end) {
        return left.span.end - right.span.end;
      }
      return left.kind.localeCompare(right.kind);
    }),
  };
}

function pushComponent(
  components: GenericDiagnosticComponent[],
  spans: Array<{ end: number; start: number }>,
  input: {
    kind: GeneratedSupportDiagnosticTraceComponentKind;
    normalizedText: string;
    start: number;
    status: GeneratedSupportDiagnosticTraceComponentStatus;
    text: string;
  },
): void {
  const component = createComponent(input);
  components.push(component);
  spans.push({ end: component.span.end, start: component.span.start });
}

function extractResidueSpans(
  sourceText: string,
  spans: readonly { end: number; start: number }[],
): GeneratedSupportUnparsedSpan[] {
  if (spans.length === 0) {
    return [];
  }
  const sorted = [...spans].sort((left, right) => left.start - right.start);
  const merged: Array<{ end: number; start: number }> = [];
  for (const span of sorted) {
    const previous = merged[merged.length - 1];
    if (previous === undefined || span.start > previous.end) {
      merged.push({ ...span });
      continue;
    }
    if (span.end > previous.end) {
      previous.end = span.end;
    }
  }

  const residue: GeneratedSupportUnparsedSpan[] = [];
  let cursor = 0;
  for (const span of merged) {
    if (cursor < span.start) {
      const between = trimSpan(sourceText, cursor, span.start);
      if (between !== undefined) {
        residue.push(between);
      }
    }
    cursor = Math.max(cursor, span.end);
  }
  if (cursor < sourceText.length) {
    const trailing = trimSpan(sourceText, cursor, sourceText.length);
    if (trailing !== undefined) {
      residue.push(trailing);
    }
  }
  return residue;
}

function trimSpan(
  sourceText: string,
  start: number,
  end: number,
): GeneratedSupportUnparsedSpan | undefined {
  const raw = sourceText.slice(start, end);
  if (raw.length === 0) {
    return undefined;
  }
  const leadingSpaces = raw.match(/^\s*/)?.[0].length ?? 0;
  const trailingSpaces = raw.match(/\s*$/)?.[0].length ?? 0;
  const trimmedStart = start + leadingSpaces;
  const trimmedEnd = end - trailingSpaces;
  if (trimmedEnd <= trimmedStart) {
    return undefined;
  }
  const text = sourceText.slice(trimmedStart, trimmedEnd);
  if (!/[A-Za-z0-9]/.test(text)) {
    return undefined;
  }
  return {
    end: trimmedEnd,
    start: trimmedStart,
    text,
  };
}

function createComponent({
  kind,
  normalizedText,
  start,
  status,
  text,
}: {
  kind: GeneratedSupportDiagnosticTraceComponentKind;
  normalizedText: string;
  start: number;
  status: GeneratedSupportDiagnosticTraceComponentStatus;
  text: string;
}): GenericDiagnosticComponent {
  const end = start + text.length;
  return {
    id: `${kind}:${normalizedText}`,
    kind,
    normalizedText,
    span: {
      end,
      start,
      text,
    },
    status,
    text,
  };
}

function normalizeDiagnosticText(sourceText: string): string {
  return sourceText
    .replace(/\u2212/g, "-")
    .trim()
    .toLowerCase();
}
