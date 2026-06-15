import type { GameState } from "@optcg/types";

import { reifyCardRef } from "../actions/state.js";
import {
  isSupportedBattleResolutionEnvelope,
  isSupportedCounterStepTarget,
  sameCardRef,
} from "./support.js";
import { getSupportedBattleCombatView } from "./capabilities.js";
import { detectPendingRuntimeWork } from "../effect-runtime.js";

export const getUnsupportedDamageStepContinuationReason = (
  state: GameState,
): string | undefined => {
  const battle = state.battle;
  if (
    battle === undefined ||
    battle.step !== "counter" ||
    !isSupportedBattleResolutionEnvelope(battle)
  ) {
    return "Battle requires unsupported blocker, step, or multi-damage behavior.";
  }
  if (
    detectPendingRuntimeWork(state) !== undefined ||
    state.replacementState.length > 0
  ) {
    return "Battle requires unsupported trigger or replacement processing.";
  }
  if (battle.blocker !== undefined) {
    const blocker = reifyCardRef(state, battle.blocker);
    if (
      blocker === null ||
      blocker.isLeader ||
      !sameCardRef(battle.blocker, battle.currentTarget)
    ) {
      return "Battle blocker is stale or invalid.";
    }
  }

  const combat = getSupportedBattleCombatView(state, battle);
  if ("reason" in combat) return combat.reason;
  const { attackerView, target, targetView } = combat;
  if (
    target.isLeader &&
    battle.damageCount !== 2 &&
    attackerView.keywords.includes("doubleAttack")
  ) {
    return "Battle requires unsupported keyword or protection handling.";
  }
  if (
    attackerView.currentPower >= targetView.currentPower &&
    !target.isLeader
  ) {
    const targetPlayer = state.players[target.playerId];
    const targetIndex = targetPlayer?.characters.findIndex(
      (character) => character.instanceId === target.card.instanceId,
    );
    if (
      targetPlayer === undefined ||
      targetIndex === undefined ||
      targetIndex < 0 ||
      !isSupportedCounterStepTarget(battle, target)
    ) {
      return "Battle target is no longer a supported rested character target.";
    }
  }
  return undefined;
};
