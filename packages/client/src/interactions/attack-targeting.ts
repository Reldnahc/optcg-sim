import type { InstanceId } from "@optcg/types";

import type { ClientActionModel } from "../view-model.js";

export const ATTACK_TARGET_CHOICE_ACTION_INDEX = -20;

export interface AttackTargetChoice {
  attackerInstanceId: string;
  chooseActionIndex: number;
  targetActions: Array<{ targetInstanceId: string; actionIndex: number }>;
}

export const createAttackTargetChoice = (
  attackerInstanceId: string,
  actions: readonly ClientActionModel[],
): AttackTargetChoice | undefined => {
  const targetActions = actions.flatMap((action) =>
    action.type === "declareAttack" &&
    action.attack?.attackerInstanceId === (attackerInstanceId as InstanceId)
      ? [
          {
            targetInstanceId: String(action.attack.targetInstanceId),
            actionIndex: action.index,
          },
        ]
      : [],
  );
  return targetActions.length === 0
    ? undefined
    : {
        attackerInstanceId,
        chooseActionIndex: ATTACK_TARGET_CHOICE_ACTION_INDEX,
        targetActions,
      };
};

export const createCollapsedAttackActions = (
  actions: readonly ClientActionModel[],
): ClientActionModel[] => {
  const attackActions = actions.filter(
    (action) => action.type === "declareAttack",
  );
  const otherActions = actions.filter(
    (action) => action.type !== "declareAttack",
  );
  return attackActions.length === 0
    ? [...actions]
    : [
        {
          index: ATTACK_TARGET_CHOICE_ACTION_INDEX,
          type: "chooseAttackTarget",
          label: "Attack",
        },
        ...otherActions,
      ];
};

export const attackTargetActionForInstance = (
  choice: AttackTargetChoice | undefined,
  instanceId: string,
): number | undefined =>
  choice?.targetActions.find((action) => action.targetInstanceId === instanceId)
    ?.actionIndex;

export const attackTargetInstanceIds = (
  choice: AttackTargetChoice | undefined,
): string[] =>
  choice?.targetActions.map((action) => action.targetInstanceId) ?? [];
