import type { EffectQueueEntry, PlayerId, TimingWindowId } from "@optcg/types";

export interface TimingWindowRankInput {
  timingWindowId: TimingWindowId;
  rank: number;
}

export type EffectQueueOrderingValidationFailureReason =
  | "nonPendingEntry"
  | "invalidRank"
  | "duplicateTimingWindowRank"
  | "conflictingTimingWindowRank"
  | "duplicateRank"
  | "missingTimingWindowRank"
  | "extraTimingWindowRank"
  | "nonContiguousRanks";

export type EffectQueueOrderingValidationResult =
  | {
      ok: true;
      entries: readonly EffectQueueEntry[];
      timingWindowRanks: ReadonlyMap<TimingWindowId, number>;
    }
  | {
      ok: false;
      reason: EffectQueueOrderingValidationFailureReason;
      timingWindowId?: TimingWindowId;
      rank?: number;
    };

export type EffectQueueOrderingValidatedInput = Extract<
  EffectQueueOrderingValidationResult,
  { ok: true }
>;

export interface EffectQueueGroup {
  timingWindowId: TimingWindowId;
  timingWindowRank: number;
  generation: number;
  orderingGroup: EffectQueueEntry["orderingGroup"];
  controllerId: PlayerId;
  entries: readonly EffectQueueEntry[];
  requiresChooseTriggerOrder: boolean;
  choicePlayerId?: PlayerId;
}

const compareCodeUnitOrder = (left: string, right: string): number => {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
};

const compareEffectQueueGroups = (
  left: Pick<
    EffectQueueGroup,
    "timingWindowRank" | "generation" | "orderingGroup" | "controllerId"
  >,
  right: Pick<
    EffectQueueGroup,
    "timingWindowRank" | "generation" | "orderingGroup" | "controllerId"
  >,
): number => {
  const rankDifference = left.timingWindowRank - right.timingWindowRank;
  if (rankDifference !== 0) {
    return rankDifference;
  }

  const generationDifference = left.generation - right.generation;
  if (generationDifference !== 0) {
    return generationDifference;
  }

  const orderingGroupDifference =
    orderingGroupRank(left.orderingGroup) -
    orderingGroupRank(right.orderingGroup);
  if (orderingGroupDifference !== 0) {
    return orderingGroupDifference;
  }

  return compareCodeUnitOrder(left.controllerId, right.controllerId);
};

export type NoChoiceEffectQueueOrderingResult =
  | { ok: true; entries: readonly EffectQueueEntry[] }
  | { ok: false; reason: "choiceRequired"; controllerId: PlayerId };

const validationFailure = (
  reason: EffectQueueOrderingValidationFailureReason,
  details: { timingWindowId?: TimingWindowId; rank?: number } = {},
): EffectQueueOrderingValidationResult => ({
  ok: false,
  reason,
  ...details,
});

export const validateEffectQueueOrderingInput = (
  entries: readonly EffectQueueEntry[],
  timingWindowRanks: readonly TimingWindowRankInput[],
): EffectQueueOrderingValidationResult => {
  const queueWindowIds = new Set<TimingWindowId>();
  for (const entry of entries) {
    if (entry.state !== "pending") {
      return validationFailure("nonPendingEntry", {
        timingWindowId: entry.timingWindowId,
      });
    }
    queueWindowIds.add(entry.timingWindowId);
  }

  const rankByWindow = new Map<TimingWindowId, number>();
  const windowByRank = new Map<number, TimingWindowId>();
  for (const input of timingWindowRanks) {
    if (!Number.isInteger(input.rank) || input.rank < 0) {
      return validationFailure("invalidRank", {
        timingWindowId: input.timingWindowId,
        rank: input.rank,
      });
    }

    const existingRank = rankByWindow.get(input.timingWindowId);
    if (existingRank !== undefined) {
      return validationFailure(
        existingRank === input.rank
          ? "duplicateTimingWindowRank"
          : "conflictingTimingWindowRank",
        { timingWindowId: input.timingWindowId, rank: input.rank },
      );
    }

    const existingWindow = windowByRank.get(input.rank);
    if (existingWindow !== undefined) {
      return validationFailure("duplicateRank", {
        timingWindowId: input.timingWindowId,
        rank: input.rank,
      });
    }

    rankByWindow.set(input.timingWindowId, input.rank);
    windowByRank.set(input.rank, input.timingWindowId);
  }

  for (const timingWindowId of rankByWindow.keys()) {
    if (!queueWindowIds.has(timingWindowId)) {
      return validationFailure("extraTimingWindowRank", { timingWindowId });
    }
  }

  for (const timingWindowId of queueWindowIds) {
    if (!rankByWindow.has(timingWindowId)) {
      return validationFailure("missingTimingWindowRank", { timingWindowId });
    }
  }

  for (let rank = 0; rank < queueWindowIds.size; rank += 1) {
    if (!windowByRank.has(rank)) {
      return validationFailure("nonContiguousRanks", { rank });
    }
  }

  return {
    ok: true,
    entries,
    timingWindowRanks: new Map(
      [...rankByWindow.entries()].sort((left, right) => left[1] - right[1]),
    ),
  };
};

const orderingGroupRank = (
  orderingGroup: EffectQueueEntry["orderingGroup"],
): number => (orderingGroup === "turnPlayer" ? 0 : 1);

const groupKey = (
  timingWindowRank: number,
  generation: number,
  orderingGroup: EffectQueueEntry["orderingGroup"],
  controllerId: PlayerId,
): string =>
  [
    String(timingWindowRank),
    String(generation),
    orderingGroup,
    controllerId,
  ].join("\u0000");

export const groupValidatedEffectQueueEntries = (
  validated: EffectQueueOrderingValidatedInput,
): readonly EffectQueueGroup[] => {
  const groups = new Map<string, EffectQueueEntry[]>();
  const groupMetadata = new Map<
    string,
    Omit<
      EffectQueueGroup,
      "entries" | "requiresChooseTriggerOrder" | "choicePlayerId"
    >
  >();

  for (const entry of validated.entries) {
    const timingWindowRank = validated.timingWindowRanks.get(
      entry.timingWindowId,
    );
    if (timingWindowRank === undefined) {
      throw new Error("Validated effect queue entry is missing window rank.");
    }

    const key = groupKey(
      timingWindowRank,
      entry.generation,
      entry.orderingGroup,
      entry.controllerId,
    );
    const existing = groups.get(key);
    if (existing === undefined) {
      groups.set(key, [entry]);
      groupMetadata.set(key, {
        timingWindowId: entry.timingWindowId,
        timingWindowRank,
        generation: entry.generation,
        orderingGroup: entry.orderingGroup,
        controllerId: entry.controllerId,
      });
    } else {
      existing.push(entry);
    }
  }

  return [...groups.entries()]
    .map(([key, entries]) => {
      const metadata = groupMetadata.get(key);
      if (metadata === undefined) {
        throw new Error("Effect queue group metadata is missing.");
      }

      const requiresChooseTriggerOrder = entries.length > 1;
      return requiresChooseTriggerOrder
        ? {
            ...metadata,
            entries,
            requiresChooseTriggerOrder,
            choicePlayerId: metadata.controllerId,
          }
        : {
            ...metadata,
            entries,
            requiresChooseTriggerOrder,
          };
    })
    .sort(compareEffectQueueGroups);
};

export const findEarliestChoiceRequiredEffectQueueGroup = (
  groups: readonly EffectQueueGroup[],
): EffectQueueGroup | undefined =>
  [...groups]
    .sort(compareEffectQueueGroups)
    .find((group) => group.requiresChooseTriggerOrder);

export const findFirstNoChoiceEffectQueueEntryBeforeChoiceGroup = (
  groups: readonly EffectQueueGroup[],
  choiceGroup: EffectQueueGroup,
): EffectQueueEntry | undefined =>
  groups
    .filter(
      (group) =>
        !group.requiresChooseTriggerOrder &&
        compareEffectQueueGroups(group, choiceGroup) < 0,
    )
    .flatMap((group) => group.entries)
    .at(0);

const compareNoChoiceEntries = (
  left: { group: EffectQueueGroup; entry: EffectQueueEntry },
  right: { group: EffectQueueGroup; entry: EffectQueueEntry },
): number => {
  const rankDifference =
    left.group.timingWindowRank - right.group.timingWindowRank;
  if (rankDifference !== 0) {
    return rankDifference;
  }

  const generationDifference = left.group.generation - right.group.generation;
  if (generationDifference !== 0) {
    return generationDifference;
  }

  const orderingGroupDifference =
    orderingGroupRank(left.group.orderingGroup) -
    orderingGroupRank(right.group.orderingGroup);
  if (orderingGroupDifference !== 0) {
    return orderingGroupDifference;
  }

  const eventSeqDifference =
    left.entry.createdAtEventSeq - right.entry.createdAtEventSeq;
  if (eventSeqDifference !== 0) {
    return eventSeqDifference;
  }

  const sourceInstanceDifference = compareCodeUnitOrder(
    left.entry.source.instanceId,
    right.entry.source.instanceId,
  );
  if (sourceInstanceDifference !== 0) {
    return sourceInstanceDifference;
  }

  return compareCodeUnitOrder(
    left.entry.effectBlockId,
    right.entry.effectBlockId,
  );
};

export const orderNoChoiceEffectQueueGroups = (
  groups: readonly EffectQueueGroup[],
): NoChoiceEffectQueueOrderingResult => {
  for (const group of groups) {
    if (group.requiresChooseTriggerOrder) {
      return {
        ok: false,
        reason: "choiceRequired",
        controllerId: group.controllerId,
      };
    }
  }

  return {
    ok: true,
    entries: groups
      .flatMap((group) => group.entries.map((entry) => ({ group, entry })))
      .sort(compareNoChoiceEntries)
      .map(({ entry }) => entry),
  };
};
