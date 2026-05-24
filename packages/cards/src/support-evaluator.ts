import type {
  PrimitiveEvidence,
  PrimitiveParseResult,
  PrimitiveSupportResult,
} from "./types.js";

const requiredEvidence: readonly PrimitiveEvidence[] = [
  "wrapper:onPlay",
  "body:draw",
  "count:positiveInteger",
  "sourcePresence:mustRemain",
  "composition:wrapperBody",
];

export function evaluatePrimitiveSupport(
  result: PrimitiveParseResult,
): PrimitiveSupportResult {
  const present = new Set(result.evidence);
  const missingEvidence = requiredEvidence.filter(
    (evidence) => !present.has(evidence),
  );

  return {
    supported: missingEvidence.length === 0,
    missingEvidence,
  };
}
