import type { InstanceId } from "@optcg/types";

import type { ClientVisibleAction } from "../transport.js";
import type {
  BoardViewModel,
  ClientActionModel,
  ClientCardModel,
} from "../view-model.js";

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

const hasAttachDonActionForDon = (
  actions: readonly ClientVisibleAction[],
  donInstanceId: string,
): boolean =>
  actions.some(
    (action) =>
      action.attachment?.donInstanceId === (donInstanceId as InstanceId),
  );

export const hasSelectedDonAttachmentTargetAction = (
  selectedDonInstanceIds: readonly string[],
  actions: readonly ClientVisibleAction[],
  targetInstanceId: string,
): boolean =>
  selectedDonInstanceIds.length > 0 &&
  selectedDonInstanceIds.every(
    (donInstanceId) =>
      findAttachDonActionIndex(actions, donInstanceId, targetInstanceId) !==
      undefined,
  );

const costAreaDon = (
  board: BoardViewModel | undefined,
  instanceId: string,
): ClientCardModel | undefined =>
  [...(board?.self.costArea ?? []), ...(board?.opponent.costArea ?? [])].find(
    (candidate) => String(candidate.instanceId) === instanceId,
  );

export const selectedDonAttachmentClickIntent = ({
  confirmAttachDon,
  selectedDonInstanceIds,
  targetInstanceId,
}: {
  confirmAttachDon: boolean;
  selectedDonInstanceIds: readonly string[];
  targetInstanceId: string;
}): { type: "attach" | "confirm"; targetInstanceId: string } | undefined => {
  if (selectedDonInstanceIds.length === 0) {
    return undefined;
  }
  return {
    type: confirmAttachDon ? "confirm" : "attach",
    targetInstanceId,
  };
};

export const isSelectableCostAreaDon = (
  board: BoardViewModel | undefined,
  instanceId: string,
  legalActions?: readonly ClientVisibleAction[],
): boolean => {
  const card = costAreaDon(board, instanceId);
  if (
    card === undefined ||
    (String(card.cardId) !== "DON" && card.category.toLowerCase() !== "don")
  ) {
    return false;
  }
  if (legalActions !== undefined) {
    return hasAttachDonActionForDon(legalActions, instanceId);
  }
  return (
    board?.self.costArea.some(
      (candidate) => String(candidate.instanceId) === instanceId,
    ) === true && card.state === "active"
  );
};

export const selectedDonAttachmentMenuAction = (
  selectedDonInstanceIds: readonly string[],
  legalActions?: readonly ClientVisibleAction[],
  targetInstanceId?: string,
): ClientActionModel | undefined => {
  if (selectedDonInstanceIds.length === 0) {
    return undefined;
  }
  if (
    legalActions !== undefined &&
    targetInstanceId !== undefined &&
    !selectedDonInstanceIds.every(
      (donInstanceId) =>
        findAttachDonActionIndex(
          legalActions,
          donInstanceId,
          targetInstanceId,
        ) !== undefined,
    )
  ) {
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
