import type { CardRef, GameState } from "@optcg/types";

import { reifyCardRef } from "../actions/state.js";

type BattleState = NonNullable<GameState["battle"]>;
type InternalBattleState = BattleState & { damageProcess?: unknown };

const clearDamageProcess = (battle: BattleState): BattleState => {
  const normalized = { ...battle } as InternalBattleState;
  delete normalized.damageProcess;
  return normalized;
};

export const normalizeBattleTargetDamageCount = (
  state: GameState,
  battle: BattleState,
): BattleState | null => {
  const target = reifyCardRef(state, battle.currentTarget);
  if (target === null) {
    return null;
  }
  if (target.isLeader) {
    return battle;
  }
  return { ...clearDamageProcess(battle), damageCount: 1 };
};

export const retargetBattle = (
  state: GameState,
  battle: BattleState,
  currentTarget: CardRef,
): BattleState | null =>
  normalizeBattleTargetDamageCount(state, { ...battle, currentTarget });
