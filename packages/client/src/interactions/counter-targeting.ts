import type { InstanceId } from "@optcg/types";

import type { ClientActionModel } from "../view-model.js";

export const COUNTER_TARGET_CHOICE_ACTION_INDEX = -21;

export interface CounterTargetChoice {
  counterCardInstanceId: string;
  chooseActionIndex: number;
  targetActions: Array<{ targetInstanceId: string; actionIndex: number }>;
}

export const createCounterTargetChoice = (
  counterCardInstanceId: string,
  actions: readonly ClientActionModel[],
): CounterTargetChoice | undefined => {
  const targetActions = actions.flatMap((action) =>
    action.type === "useCounter" &&
    action.counter?.cardInstanceId === (counterCardInstanceId as InstanceId)
      ? [
          {
            targetInstanceId: String(action.counter.targetInstanceId),
            actionIndex: action.index,
          },
        ]
      : [],
  );
  return targetActions.length <= 1
    ? undefined
    : {
        counterCardInstanceId,
        chooseActionIndex: COUNTER_TARGET_CHOICE_ACTION_INDEX,
        targetActions,
      };
};

export const createCollapsedCounterActions = (
  actions: readonly ClientActionModel[],
): ClientActionModel[] => {
  const counterActions = actions.filter(
    (action) => action.type === "useCounter",
  );
  const otherActions = actions.filter((action) => action.type !== "useCounter");
  return counterActions.length <= 1
    ? [...actions]
    : [
        {
          index: COUNTER_TARGET_CHOICE_ACTION_INDEX,
          type: "chooseCounterTarget",
          label: "Counter",
        },
        ...otherActions,
      ];
};

export const counterTargetActionForInstance = (
  choice: CounterTargetChoice | undefined,
  instanceId: string,
): number | undefined =>
  choice?.targetActions.find((action) => action.targetInstanceId === instanceId)
    ?.actionIndex;

export const counterTargetInstanceIds = (
  choice: CounterTargetChoice | undefined,
): string[] =>
  choice?.targetActions.map((action) => action.targetInstanceId) ?? [];
