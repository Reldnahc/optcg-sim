import type { GameState } from "@optcg/types";

type BattleState = NonNullable<GameState["battle"]>;
type BattleWithDamageProcess = BattleState & {
  readonly damageProcess?: {
    readonly sourceKeyword?: string;
  };
};

type BattleDamageTarget = {
  readonly isLeader: boolean;
};

type BattleDamageAttackerView = {
  readonly keywords: readonly string[];
};

export type BattleDamageCountResult =
  | {
      readonly attackerHasDoubleAttack: boolean;
      readonly battleDamageCount: 1 | 2;
    }
  | {
      readonly reason:
        | "Battle requires unsupported blocker, step, or multi-damage behavior."
        | "Battle requires unsupported keyword or protection handling.";
    };

export const resolveBattleDamageCount = ({
  attackerView,
  battle,
  target,
}: {
  readonly battle: BattleState;
  readonly attackerView: BattleDamageAttackerView;
  readonly target: BattleDamageTarget;
}): BattleDamageCountResult => {
  const battleWithInternal = battle as BattleWithDamageProcess;
  const attackerHasDoubleAttack =
    attackerView.keywords.includes("doubleAttack");
  const declaredDoubleAttackDamage =
    battleWithInternal.damageProcess?.sourceKeyword === "doubleAttack";
  const declaredBattleDamageCount = battle.damageCount;
  if (declaredBattleDamageCount !== 1 && declaredBattleDamageCount !== 2) {
    return {
      reason:
        "Battle requires unsupported blocker, step, or multi-damage behavior.",
    };
  }

  const battleDamageCount =
    declaredBattleDamageCount === 2 &&
    !attackerHasDoubleAttack &&
    declaredDoubleAttackDamage
      ? 1
      : target.isLeader &&
          declaredBattleDamageCount === 1 &&
          attackerHasDoubleAttack &&
          battleWithInternal.damageProcess === undefined
        ? 2
        : declaredBattleDamageCount;

  if (
    battleDamageCount === 2 &&
    !attackerHasDoubleAttack &&
    !declaredDoubleAttackDamage
  ) {
    return {
      reason: "Battle requires unsupported keyword or protection handling.",
    };
  }

  return { attackerHasDoubleAttack, battleDamageCount };
};
