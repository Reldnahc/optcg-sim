import type { EffectTextSpanId } from "./effect-presentation.js";

export type SupportEvidenceAuthority = "parser" | "runtime";

export type SupportEvidenceFamily =
  | "entryPoint"
  | "wrapper"
  | "marker"
  | "sourcePresence"
  | "activation"
  | "trigger"
  | "entrySupport"
  | "cost"
  | "condition"
  | "body"
  | "target"
  | "targetConstraint"
  | "filter"
  | "cardinality"
  | "quantity"
  | "zone"
  | "destination"
  | "visibility"
  | "player"
  | "chooser"
  | "duration"
  | "usageLimit"
  | "modifier"
  | "replacement"
  | "reference"
  | "composition"
  | "connector"
  | "expression"
  | "value"
  | "keyword"
  | "remaining"
  | "order"
  | "position"
  | "deckRestriction"
  | "state"
  | "sourceCategory"
  | "instructionSupport"
  | "unknown";

export interface SupportEvidenceRecord {
  readonly authority: SupportEvidenceAuthority;
  readonly family: SupportEvidenceFamily;
  readonly id: string;
  readonly sourceSpanIds?: readonly EffectTextSpanId[];
  readonly effectPath?: readonly string[];
  readonly supported?: boolean;
  readonly reason?: string;
}

export interface MissingSupportEvidence {
  readonly authority: SupportEvidenceAuthority;
  readonly family: SupportEvidenceFamily;
  readonly id: string;
  readonly reason: string;
  readonly effectPath?: readonly string[];
}

export interface ParserSupportCertificate {
  readonly complete: boolean;
  readonly records: readonly SupportEvidenceRecord[];
  readonly missing: readonly MissingSupportEvidence[];
}

export interface RuntimeSupportReport {
  readonly supported: boolean;
  readonly reason?: string;
  readonly records: readonly SupportEvidenceRecord[];
  readonly missing: readonly MissingSupportEvidence[];
}
