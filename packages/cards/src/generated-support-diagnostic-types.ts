export interface GeneratedSupportUnparsedSpan {
  start: number;
  end: number;
  text: string;
}

export interface GeneratedSupportDiagnosticDecomposition {
  recognizedActionCandidates: readonly string[];
  recognizedSyntaxFragments: readonly string[];
  recognizedTriggerCandidates: readonly string[];
  reason: string;
  traceComponents?: readonly GeneratedSupportDiagnosticTraceComponent[];
  unsupportedConditionFragments: readonly string[];
  unsupportedSyntaxFragments: readonly string[];
}

export type GeneratedSupportDiagnosticTraceComponentKind =
  | "action"
  | "cardinality"
  | "condition"
  | "condition-connector"
  | "cost"
  | "destination"
  | "duration"
  | "modifier"
  | "optionality"
  | "predicate"
  | "quantity"
  | "restriction"
  | "saved-reference"
  | "sequence"
  | "target"
  | "trigger"
  | "wrapper";

export type GeneratedSupportDiagnosticTraceComponentStatus =
  | "recognized"
  | "supported"
  | "unsupported";

export interface GeneratedSupportDiagnosticTraceComponent {
  kind: GeneratedSupportDiagnosticTraceComponentKind;
  status: GeneratedSupportDiagnosticTraceComponentStatus;
  text: string;
  id?: string;
  span?: GeneratedSupportUnparsedSpan;
}
