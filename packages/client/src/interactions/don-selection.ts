import type { InstanceId } from "@optcg/types";

import type { ClientVisibleAction } from "../transport.js";
import type { BoardViewModel } from "../view-model.js";

export const toggleSelectedDonInstanceId = (
  selectedInstanceIds: readonly string[],
  instanceId: string,
): string[] =>
  selectedInstanceIds.includes(instanceId)
    ? selectedInstanceIds.filter((selected) => selected !== instanceId)
    : [...selectedInstanceIds, instanceId];

export const findAttachDonActionIndex = (
  actions: readonly ClientVisibleAction[],
  donInstanceId: string,
  targetInstanceId: string,
): number | undefined =>
  actions.find(
    (action) =>
      action.attachment?.donInstanceId === (donInstanceId as InstanceId) &&
      action.attachment.targetInstanceId === (targetInstanceId as InstanceId),
  )?.index;

export const isSelectableCostAreaDon = (
  board: BoardViewModel | undefined,
  instanceId: string,
): boolean => {
  const card = board?.self.costArea.find(
    (candidate) => String(candidate.instanceId) === instanceId,
  );
  return (
    card !== undefined &&
    card.state === "active" &&
    (String(card.cardId) === "DON" || card.category.toLowerCase() === "don")
  );
};
