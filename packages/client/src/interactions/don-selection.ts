import type { InstanceId } from "@optcg/types";

import type { ClientVisibleAction } from "../transport.js";
import type { BoardViewModel, ClientActionModel } from "../view-model.js";

export const ATTACH_SELECTED_DON_ACTION_INDEX = -1;

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

export const selectedDonAttachmentMenuAction = (
  selectedDonInstanceIds: readonly string[],
): ClientActionModel | undefined => {
  if (selectedDonInstanceIds.length === 0) {
    return undefined;
  }
  return {
    index: ATTACH_SELECTED_DON_ACTION_INDEX,
    type: "attachDon",
    label:
      selectedDonInstanceIds.length === 1
        ? "Attach selected DON!!"
        : `Attach ${String(selectedDonInstanceIds.length)} selected DON!!`,
  };
};
