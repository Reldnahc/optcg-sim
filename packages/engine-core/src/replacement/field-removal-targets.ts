import type {
  CardRef,
  CausalityRef,
  ReplacementProcess,
  ReplaceableProcessType,
} from "@optcg/types";

export const isCardRef = (value: unknown): value is CardRef => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  const zone = candidate["zone"];
  return (
    typeof candidate["instanceId"] === "string" &&
    typeof candidate["cardId"] === "string" &&
    typeof candidate["playerId"] === "string" &&
    (zone === undefined || (typeof zone === "object" && zone !== null))
  );
};

const isCardRefArray = (value: unknown): value is readonly CardRef[] =>
  Array.isArray(value) && value.every(isCardRef);

export const cardRefsEqual = (left: CardRef, right: CardRef): boolean =>
  left.instanceId === right.instanceId &&
  left.cardId === right.cardId &&
  left.playerId === right.playerId &&
  left.zone?.zone === right.zone?.zone &&
  left.zone?.playerId === right.zone?.playerId &&
  left.zone?.slot === right.zone?.slot &&
  left.zone?.index === right.zone?.index;

export const fieldRemovalProcessTargets = (
  process: ReplacementProcess,
): readonly CardRef[] => {
  const payload = process.payload;
  if (typeof payload === "object" && payload !== null) {
    const targets = (payload as Record<string, unknown>)["targets"];
    if (isCardRefArray(targets) && targets.length > 0) {
      return targets;
    }
  }
  return process.target === undefined ? [] : [process.target];
};

export const withFieldRemovalProcessTargets = (
  process: ReplacementProcess,
  targets: readonly CardRef[],
): ReplacementProcess => {
  const firstTarget = targets[0];
  const payload =
    typeof process.payload === "object" && process.payload !== null
      ? { ...(process.payload as Record<string, unknown>) }
      : {};
  delete payload["target"];
  delete payload["targets"];
  if (firstTarget !== undefined) {
    payload["target"] = firstTarget;
  }
  if (targets.length > 1) {
    payload["targets"] = [...targets];
  }
  const nextProcess: ReplacementProcess = {
    ...process,
    payload,
  };
  if (firstTarget === undefined) {
    delete nextProcess.target;
  } else {
    nextProcess.target = firstTarget;
  }
  return nextProcess;
};

export const withoutFieldRemovalProcessTargets = (
  process: ReplacementProcess,
  removedTargets: readonly CardRef[],
): ReplacementProcess =>
  withFieldRemovalProcessTargets(
    process,
    fieldRemovalProcessTargets(process).filter(
      (target) =>
        !removedTargets.some((removed) => cardRefsEqual(target, removed)),
    ),
  );

export const isCausalityRef = (value: unknown): value is CausalityRef => {
  if (typeof value !== "object" || value === null || !("type" in value)) {
    return false;
  }
  const type = (value as { type?: unknown }).type;
  return (
    type === "playerAction" ||
    type === "effect" ||
    type === "ruleProcess" ||
    type === "replacement" ||
    type === "decision"
  );
};

export const replacementProcessFromStoredPayload = (params: {
  causedBy: CausalityRef;
  payload: unknown;
  processId: string;
  type: ReplaceableProcessType;
  usedReplacementIds: readonly string[];
}): ReplacementProcess | null => {
  if (typeof params.payload !== "object" || params.payload === null) {
    return null;
  }
  const payload = params.payload as Record<string, unknown>;
  const source = payload["source"];
  const targets = fieldRemovalProcessTargets({
    id: params.processId,
    type: params.type,
    payload,
    causedBy: params.causedBy,
    usedReplacementIds: [...params.usedReplacementIds],
  });
  if (source !== undefined && !isCardRef(source)) {
    return null;
  }
  const process = withFieldRemovalProcessTargets(
    {
      id: params.processId,
      type: params.type,
      ...(source === undefined ? {} : { source }),
      payload,
      causedBy: params.causedBy,
      usedReplacementIds: [...params.usedReplacementIds],
    },
    targets,
  );
  return process;
};
