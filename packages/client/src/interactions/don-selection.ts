import type { InstanceId } from "@optcg/types";

import type { ClientVisibleAction } from "../transport.js";

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
