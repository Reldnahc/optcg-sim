import type { QueueEntryId } from "@optcg/types";

export const hasExactQueueEntryIds = (
  expectedIds: readonly QueueEntryId[],
  receivedIds: readonly QueueEntryId[],
): boolean => {
  if (expectedIds.length !== receivedIds.length) {
    return false;
  }
  if (new Set(receivedIds).size !== receivedIds.length) {
    return false;
  }
  const expected = new Set(expectedIds);
  return receivedIds.every((id) => expected.has(id));
};
