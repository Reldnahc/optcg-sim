import type { CardRef } from "./card-metadata.js";

export type EffectTextDocumentKind = "effect" | "trigger";

export type EffectTextSpanRole =
  | "line"
  | "entry"
  | "marker"
  | "cost"
  | "condition"
  | "choice"
  | "choiceOption"
  | "connector"
  | "body"
  | "target"
  | "filter"
  | "duration";

export type EffectTextSpanId = `span:${string}`;

export interface EffectTextSpan {
  readonly id: EffectTextSpanId;
  readonly role: EffectTextSpanRole;
  readonly start: number;
  readonly end: number;
  readonly text: string;
  readonly primitiveEvidence?: readonly string[];
  readonly effectBlockId?: string;
  readonly effectPath?: readonly string[];
  readonly sequenceIndex?: number;
  readonly parentSpanId?: EffectTextSpanId;
}

export interface EffectTextSourceMap {
  readonly textKind: EffectTextDocumentKind;
  readonly sourceText: string;
  readonly spans: readonly EffectTextSpan[];
}

export interface EffectTextPresentationRef {
  readonly textKind: EffectTextDocumentKind;
  readonly spanIds: readonly EffectTextSpanId[];
}

export interface EffectTextTargetLink {
  readonly spanId: EffectTextSpanId;
  readonly cards: readonly CardRef[];
  readonly relation: "candidateTarget" | "selectedTarget" | "affectedCard";
}

export interface ActiveEffectTextPresentation {
  readonly source: CardRef;
  readonly textKind?: EffectTextDocumentKind;
  readonly activeSpanIds: readonly EffectTextSpanId[];
  readonly targetLinks?: readonly EffectTextTargetLink[];
}
