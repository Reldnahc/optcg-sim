export interface CounterPayCostDecisionContext {
  counterEventInstanceId: string;
  kind: "effect" | "printed";
  targetInstanceId: string;
}

const encodeDecisionSegment = (value: string): string =>
  encodeURIComponent(value);

const decodeDecisionSegment = (value: string): string =>
  decodeURIComponent(value);

const counterPayCostDecisionPattern =
  /^decision:counterStep:payCost:([^:]+):([^:]+):(?:(effect|printed):)?\d+$/;

export const counterPayCostDecisionId = (
  counterEventInstanceId: string,
  targetInstanceId: string,
  sequence: number,
  kind: "effect" | "printed" = "printed",
): string =>
  [
    "decision:counterStep:payCost",
    encodeDecisionSegment(counterEventInstanceId),
    encodeDecisionSegment(targetInstanceId),
    kind,
    String(sequence),
  ].join(":");

export const parseCounterPayCostDecisionId = (
  id: string,
): CounterPayCostDecisionContext | null => {
  const match = counterPayCostDecisionPattern.exec(id);
  if (match?.[1] === undefined || match[2] === undefined) {
    return null;
  }
  return {
    counterEventInstanceId: decodeDecisionSegment(match[1]),
    kind: match[3] === "effect" ? "effect" : "printed",
    targetInstanceId: decodeDecisionSegment(match[2]),
  };
};
