import type { CardRef } from "./card-metadata.js";
import type {
  DecisionId,
  EffectId,
  EngineEventId,
  QueueEntryId,
} from "./primitives.js";

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

export type EffectSpotlightHistoryEntryStatus = "pending" | "resolved";

export interface EffectSpotlightHistoryEntry {
  readonly id: string;
  readonly key: string;
  readonly semanticKey: string;
  readonly mode: "live" | "resolved";
  readonly status: EffectSpotlightHistoryEntryStatus;
  readonly active: ActiveEffectTextPresentation;
  readonly pendingDecisionId?: DecisionId;
  readonly resolvedEventId?: EngineEventId;
  readonly queueEntryId?: QueueEntryId;
  readonly effectBlockId?: EffectId;
}

export interface EffectSpotlightHistory {
  readonly entries: readonly EffectSpotlightHistoryEntry[];
  readonly presentKey?: string;
}
