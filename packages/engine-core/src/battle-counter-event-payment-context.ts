export interface CounterPayCostDecisionContext {
  counterEventInstanceId: string;
  targetInstanceId: string;
}

const encodeDecisionSegment = (value: string): string =>
  encodeURIComponent(value);

const decodeDecisionSegment = (value: string): string =>
  decodeURIComponent(value);

const counterPayCostDecisionPattern =
  /^decision:counterStep:payCost:([^:]+):([^:]+):\d+$/;

export const counterPayCostDecisionId = (
  counterEventInstanceId: string,
  targetInstanceId: string,
  sequence: number,
): string =>
  [
    "decision:counterStep:payCost",
    encodeDecisionSegment(counterEventInstanceId),
    encodeDecisionSegment(targetInstanceId),
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
    targetInstanceId: decodeDecisionSegment(match[2]),
  };
};
