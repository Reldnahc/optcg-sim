export type CardTextDiagnosticComponentKind =
  | "action"
  | "cardinality"
  | "condition"
  | "condition-connector"
  | "cost"
  | "cost-separator"
  | "destination"
  | "duration"
  | "modifier"
  | "optionality"
  | "predicate"
  | "residue"
  | "sequence-connector"
  | "target"
  | "wrapper";

export type CardTextDiagnosticComponentStatus = "recognized" | "unsupported";

export interface CardTextDiagnosticSpan {
  end: number;
  start: number;
  text: string;
}

export interface CardTextDiagnosticComponent {
  componentPath: string;
  id: string;
  kind: CardTextDiagnosticComponentKind;
  normalizedText: string;
  span: CardTextDiagnosticSpan;
  status: CardTextDiagnosticComponentStatus;
  text: string;
}

export interface CardTextDiagnostics {
  components: readonly CardTextDiagnosticComponent[];
  sourceText: string;
  supportAuthority: "diagnostic-only";
}

type MutableComponent = CardTextDiagnosticComponent;

export function scanCardTextDiagnostics(
  sourceText: string,
): CardTextDiagnostics {
  const components: MutableComponent[] = [];
  scanLeadingWrappers(sourceText, components);
  scanUnbracketedWrapper(sourceText, components);
  scanIfCondition(sourceText, components);
  scanBodyComponents(sourceText, components);

  if (components.length === 0 && sourceText.trim().length > 0) {
    const trimmed = trimSpan(sourceText, 0, sourceText.length);
    components.push(
      makeComponent({
        componentPath: "residue:unsupported",
        kind: "residue",
        normalizedText: trimmed.text,
        span: trimmed,
        status: "unsupported",
      }),
    );
  }

  return {
    components: components.sort(compareComponents),
    sourceText,
    supportAuthority: "diagnostic-only",
  };
}

function scanUnbracketedWrapper(
  sourceText: string,
  components: MutableComponent[],
): void {
  if (!/^If\b/.test(sourceText.trimStart())) {
    return;
  }
  const start = sourceText.indexOf("If");
  components.push(
    makeComponent({
      componentPath: "wrapper:unbracketed-if",
      id: "wrapper:unbracketed-if",
      kind: "wrapper",
      normalizedText: "unbracketed If",
      span: {
        end: start + 2,
        start,
        text: "If",
      },
      status: "recognized",
      displayText: "unbracketed If",
    }),
  );
}

function scanLeadingWrappers(
  sourceText: string,
  components: MutableComponent[],
): void {
  const matcher = /\[[^\]]+\]/g;
  let expectedStart = 0;

  for (const match of sourceText.matchAll(matcher)) {
    const wrapperText = match[0];
    const start = match.index;
    if (start !== expectedStart) {
      return;
    }

    const wrapperId = toWrapperId(wrapperText);
    components.push(
      makeComponent({
        componentPath: `wrapper:${wrapperId}`,
        id: `wrapper:${wrapperId}:${String(start)}-${String(start + wrapperText.length)}`,
        kind: "wrapper",
        normalizedText: wrapperText,
        span: {
          end: start + wrapperText.length,
          start,
          text: wrapperText,
        },
        status: "recognized",
      }),
    );

    const nextOffset = start + wrapperText.length;
    if (sourceText[nextOffset] === "/") {
      expectedStart = nextOffset + 1;
      continue;
    }
    if (sourceText[nextOffset] === " ") {
      return;
    }
    expectedStart = nextOffset;
  }
}

function scanIfCondition(
  sourceText: string,
  components: MutableComponent[],
): void {
  const ifMatch = /\bIf\s+(.+?),/i.exec(sourceText);
  if (ifMatch === null) {
    return;
  }

  const conditionText = ifMatch[1]?.trim();
  if (conditionText === undefined || conditionText.length === 0) {
    return;
  }

  const conditionStart = sourceText.indexOf(conditionText, ifMatch.index);
  if (conditionStart < 0) {
    return;
  }

  scanConditionText(conditionText, conditionStart, components);
}

function scanConditionText(
  conditionText: string,
  offset: number,
  components: MutableComponent[],
): void {
  const connectorMatches = [...conditionText.matchAll(/\s(and|or)\s/gi)].filter(
    (match) => {
      const right = conditionText.slice(match.index + match[0].length);
      return !/^(more|less)\b/i.test(right.trimStart());
    },
  );
  let segmentStart = 0;

  for (const match of connectorMatches) {
    const start = match.index;
    const connector = match[1]?.toLowerCase();
    if (connector !== "and" && connector !== "or") {
      continue;
    }

    scanConditionSegment(
      conditionText.slice(segmentStart, start),
      offset + segmentStart,
      components,
    );
    const connectorStart = offset + start + 1;
    components.push(
      makeComponent({
        componentPath: `condition-connector:${connector}`,
        id: `condition-connector:${connector}`,
        kind: "condition-connector",
        normalizedText: connector,
        span: {
          end: connectorStart + connector.length,
          start: connectorStart,
          text: connector,
        },
        status: "recognized",
      }),
    );
    segmentStart = start + match[0].length;
  }

  scanConditionSegment(
    conditionText.slice(segmentStart),
    offset + segmentStart,
    components,
  );
}

function scanConditionSegment(
  segmentText: string,
  offset: number,
  components: MutableComponent[],
): void {
  const span = trimRelativeSpan(segmentText, offset);
  if (span.text.length === 0) {
    return;
  }

  const leaderType = /^your Leader has (?:the )?\{([^}]+)\} type$/i.exec(
    span.text,
  );
  if (leaderType !== null) {
    const typeName = leaderType[1]?.trim();
    if (typeName !== undefined && typeName.length > 0) {
      components.push(
        makeComponent({
          componentPath: "condition:leader-type",
          id: `condition:leader-type:${typeName}`,
          kind: "condition",
          normalizedText: span.text,
          span,
          status: "recognized",
        }),
      );
      return;
    }
  }

  if (/^your Leader is multicolored$/i.test(span.text)) {
    components.push(
      makeComponent({
        componentPath: "condition:leader-color-count",
        id: "condition:leader-color-count:self:gte:2",
        kind: "condition",
        normalizedText: span.text,
        span,
        status: "recognized",
      }),
    );
    return;
  }

  const namedCharacter = /^you have no other \[([^\]]+)\] Characters$/i.exec(
    span.text,
  );
  if (namedCharacter !== null) {
    const name = namedCharacter[1]?.trim();
    if (name !== undefined && name.length > 0) {
      components.push(
        makeComponent({
          componentPath: "condition:named-character:absent",
          id: `condition:named-character:absent:${name}`,
          kind: "condition",
          normalizedText: span.text,
          span,
          status: "unsupported",
        }),
      );
      return;
    }
  }

  scanCountPredicate(span, components);
}

function scanBodyComponents(
  sourceText: string,
  components: MutableComponent[],
): void {
  scanAll(sourceText, /\bup to\s+(\d+)\b/gi, (match, span) => {
    const value = match[1] ?? "";
    return {
      componentPath: "cardinality:up-to",
      id: `cardinality:up-to:${value}`,
      kind: "cardinality",
      normalizedText: `up to ${value}`,
      span,
      status: "recognized",
    };
  }).forEach((component) => components.push(component));

  scanAll(
    sourceText,
    /\b(\d+)\s+(power|cost)\s+or\s+(less|more)\b/gi,
    (match, span) => {
      const value = match[1] ?? "";
      const field = (match[2] ?? "").toLowerCase();
      const op = toComparatorOperator(match[3] ?? "");
      return {
        componentPath: `predicate:${field}:${op}`,
        id: `predicate:${field}:${op}:${value}`,
        kind: "predicate",
        normalizedText: `${value} ${field} or ${op === "lte" ? "less" : "more"}`,
        span,
        status: "recognized",
      };
    },
  ).forEach((component) => components.push(component));

  scanAll(
    sourceText,
    /\b(\d+)\s+or\s+(less|more)\s+(cards in your hand|Life cards)\b/gi,
    (match, span) => {
      const value = match[1] ?? "";
      const op = toComparatorOperator(match[2] ?? "");
      const zoneText = match[3] ?? "";
      const zone = /^life/i.test(zoneText) ? "life-count" : "hand-count";
      const player = zone === "life-count" ? "opponent" : "self";
      return {
        componentPath: `predicate:${zone}:${player}:${op}`,
        id: `predicate:${zone}:${player}:${op}:${value}`,
        kind: "predicate",
        normalizedText: `${value} or ${op === "lte" ? "less" : "more"} ${zoneText}`,
        span,
        status: "recognized",
      };
    },
  ).forEach((component) => components.push(component));

  scanAll(sourceText, /\byour opponent's Characters\b/gi, (_match, span) => ({
    componentPath: "target:opponent-characters",
    id: "target:opponent-characters",
    kind: "target",
    normalizedText: "your opponent's Characters",
    span,
    status: "recognized",
  })).forEach((component) => components.push(component));

  scanAll(sourceText, /\byour DON!! cards\b/gi, (_match, span) => ({
    componentPath: "target:don:self",
    id: "target:don:self",
    kind: "target",
    normalizedText: "your DON!! cards",
    span,
    status: "recognized",
  })).forEach((component) => components.push(component));

  scanAll(sourceText, /(?:-|−|âˆ’)(\d+)\s+(cost|power)\b/g, (match, span) => {
    const value = match[1] ?? "";
    const field = match[2] ?? "";
    return {
      componentPath: `modifier:${field}:negative`,
      id: `modifier:${field}:-${value}`,
      kind: "modifier",
      normalizedText: `-${value} ${field}`,
      span,
      status: "recognized",
    };
  }).forEach((component) => components.push(component));

  scanAll(sourceText, /\bduring this turn\b/gi, (_match, span) => ({
    componentPath: "duration:this-turn",
    id: "duration:this-turn",
    kind: "duration",
    normalizedText: "during this turn",
    span,
    status: "recognized",
  })).forEach((component) => components.push(component));

  scanAll(
    sourceText,
    /\buntil the end of your opponent's next turn\b/gi,
    (_match, span) => ({
      componentPath: "duration:opponent-next-turn-end",
      id: "duration:opponent-next-turn-end",
      kind: "duration",
      normalizedText: "until the end of your opponent's next turn",
      span,
      status: "recognized",
    }),
  ).forEach((component) => components.push(component));

  scanAll(sourceText, /\bThen\b/gi, (_match, span) => ({
    componentPath: "sequence-connector:then",
    id: "sequence-connector:then",
    kind: "sequence-connector",
    normalizedText: "Then",
    span,
    status: "recognized",
  })).forEach((component) => components.push(component));

  scanAll(sourceText, /\bK\.O\./g, (_match, span) => ({
    componentPath: "action:ko",
    id: "action:ko",
    kind: "action",
    normalizedText: "K.O.",
    span,
    status: "unsupported",
  })).forEach((component) => components.push(component));

  scanAll(sourceText, /\bcost of (\d+)\b/gi, (match, span) => {
    const value = match[1] ?? "";
    return {
      componentPath: "predicate:cost:eq",
      id: `predicate:cost:eq:${value}`,
      kind: "predicate",
      normalizedText: `cost of ${value}`,
      span,
      status: "recognized",
    };
  }).forEach((component) => components.push(component));

  scanAll(sourceText, /\bdraw\s+(\d+)\s+cards?\b/gi, (match, span) => {
    const value = match[1] ?? "";
    return {
      componentPath: "action:draw",
      id: `action:draw:${value}`,
      kind: "action",
      normalizedText: `draw ${value} ${value === "1" ? "card" : "cards"}`,
      span,
      status: "recognized",
    };
  }).forEach((component) => components.push(component));

  scanAll(sourceText, /\bYou may\b/g, (_match, span) => ({
    componentPath: "optionality:may",
    id: "optionality:may",
    kind: "optionality",
    normalizedText: "You may",
    span,
    status: "recognized",
  })).forEach((component) => components.push(component));

  scanAll(sourceText, /\brest this Stage\b/gi, (_match, span) => ({
    componentPath: "cost:rest-this-stage",
    id: "cost:rest-this-stage",
    kind: "cost",
    normalizedText: "rest this Stage",
    span,
    status: "unsupported",
  })).forEach((component) => components.push(component));

  scanAll(
    sourceText,
    /\bturn 1 card from the top of your Life cards face-up\b/gi,
    (_match, span) => ({
      componentPath: "cost:life-face-up",
      id: "cost:life-face-up",
      kind: "cost",
      normalizedText: "turn 1 card from the top of your Life cards face-up",
      span,
      status: "unsupported",
    }),
  ).forEach((component) => components.push(component));

  scanAll(sourceText, /:/g, (_match, span) => ({
    componentPath: "cost-separator:colon",
    id: `cost-separator:colon:${String(span.start)}`,
    kind: "cost-separator",
    normalizedText: ":",
    span,
    status: "recognized",
  })).forEach((component) => components.push(component));

  scanAll(
    sourceText,
    /\byour \{([^}]+)\} type Characters\b/gi,
    (match, span) => {
      const trait = match[1] ?? "";
      return {
        componentPath: "target:trait-characters:self",
        id: `target:trait-characters:self:${trait}`,
        kind: "target",
        normalizedText: `your {${trait}} type Characters`,
        span,
        status: "recognized",
      };
    },
  ).forEach((component) => components.push(component));

  scanAll(sourceText, /\bthis Character\b/g, (_match, span) => ({
    componentPath: "target:self-character",
    id: "target:self-character",
    kind: "target",
    normalizedText: "this Character",
    span,
    status: "recognized",
  })).forEach((component) => components.push(component));

  scanAll(sourceText, /\+\d+\s+power\b/gi, (match, span) => ({
    componentPath: "modifier:power:positive",
    id: `modifier:power:${match[0].split(/\s+/)[0] ?? ""}`,
    kind: "modifier",
    normalizedText: match[0],
    span,
    status: "recognized",
  })).forEach((component) => components.push(component));

  scanAll(sourceText, /\bgains\s+\[Rush\]/gi, (_match, span) => ({
    componentPath: "action:gain-keyword",
    id: "action:gain-keyword:rush",
    kind: "action",
    normalizedText: "gains [Rush]",
    span,
    status: "unsupported",
  })).forEach((component) => components.push(component));

  scanAll(sourceText, /\bbottom of the owner's deck\b/gi, (_match, span) => ({
    componentPath: "destination:owner-deck-bottom",
    id: "destination:owner-deck-bottom",
    kind: "destination",
    normalizedText: "bottom of the owner's deck",
    span,
    status: "unsupported",
  })).forEach((component) => components.push(component));

  scanAll(sourceText, /\bset\s+.+?\s+as active\b/gi, (_match, span) => ({
    componentPath: "action:set-active",
    id: "action:set-active",
    kind: "action",
    normalizedText: "set active",
    span,
    status: "unsupported",
  })).forEach((component) => components.push(component));

  scanAll(
    sourceText,
    /\bPlace\s+.+?\s+at\s+the bottom of the owner's deck\b/gi,
    (_match, span) => ({
      componentPath: "action:place-bottom-deck",
      id: "action:place-bottom-deck",
      kind: "action",
      normalizedText: "place at the bottom of the owner's deck",
      span,
      status: "unsupported",
    }),
  ).forEach((component) => components.push(component));
}

function scanCountPredicate(
  span: CardTextDiagnosticSpan,
  components: MutableComponent[],
): void {
  const count =
    /^(?:you have|your opponent has)\s+(\d+)\s+or\s+(less|more)\s+(cards in your hand|Life cards)$/i.exec(
      span.text,
    );
  if (count === null) {
    return;
  }

  const value = count[1] ?? "";
  const op = toComparatorOperator(count[2] ?? "");
  const zoneText = count[3] ?? "";
  const zone = /^life/i.test(zoneText) ? "life-count" : "hand-count";
  const player = /^your opponent/i.test(span.text) ? "opponent" : "self";
  components.push(
    makeComponent({
      componentPath: `predicate:${zone}:${player}:${op}`,
      id: `predicate:${zone}:${player}:${op}:${value}`,
      kind: "predicate",
      normalizedText: span.text.replace(
        /^you have\s+|^your opponent has\s+/i,
        "",
      ),
      span,
      status: "recognized",
    }),
  );
}

function scanAll(
  sourceText: string,
  pattern: RegExp,
  build: (
    match: RegExpMatchArray,
    span: CardTextDiagnosticSpan,
  ) => Omit<CardTextDiagnosticComponent, "text">,
): readonly MutableComponent[] {
  const components: MutableComponent[] = [];
  for (const match of sourceText.matchAll(pattern)) {
    const matchedText = match[0];
    const start = match.index;
    const span = {
      end: start + matchedText.length,
      start,
      text: matchedText,
    };
    components.push(makeComponent(build(match, span)));
  }
  return components;
}

function makeComponent(
  component: Omit<CardTextDiagnosticComponent, "id" | "text"> & {
    displayText?: string;
    id?: string;
  },
): MutableComponent {
  const { displayText, ...componentFields } = component;
  return {
    ...componentFields,
    id:
      component.id ??
      `${component.componentPath}:${String(component.span.start)}-${String(component.span.end)}`,
    text: displayText ?? component.span.text,
  };
}

function trimRelativeSpan(
  sourceText: string,
  offset: number,
): CardTextDiagnosticSpan {
  const leadingWhitespaceLength =
    sourceText.length - sourceText.trimStart().length;
  const trimmedText = sourceText.trim();
  return {
    end: offset + leadingWhitespaceLength + trimmedText.length,
    start: offset + leadingWhitespaceLength,
    text: trimmedText,
  };
}

function trimSpan(
  sourceText: string,
  start: number,
  end: number,
): CardTextDiagnosticSpan {
  const text = sourceText.slice(start, end);
  const leadingWhitespaceLength = text.length - text.trimStart().length;
  const trimmedText = text.trim();
  return {
    end: start + leadingWhitespaceLength + trimmedText.length,
    start: start + leadingWhitespaceLength,
    text: trimmedText,
  };
}

function toComparatorOperator(value: string): "gte" | "lte" {
  return value.toLowerCase() === "less" ? "lte" : "gte";
}

function toWrapperId(wrapperText: string): string {
  return wrapperText
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function compareComponents(
  left: CardTextDiagnosticComponent,
  right: CardTextDiagnosticComponent,
): number {
  return (
    left.span.start - right.span.start ||
    left.span.end - right.span.end ||
    left.kind.localeCompare(right.kind) ||
    left.id.localeCompare(right.id)
  );
}
