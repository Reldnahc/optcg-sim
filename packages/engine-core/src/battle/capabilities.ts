import type { ComputedCardView, GameState, Protection } from "@optcg/types";

import { reifyCardRef, type LocatedCombatCard } from "../actions/state.js";
import { computeView } from "../view/compute-view.js";

type BattleState = NonNullable<GameState["battle"]>;

export const battleProtectionIsIrrelevant = (protection: Protection): boolean =>
  protection.process === "fieldRemoval" ||
  protection.process === "rest" ||
  (protection.process === "ko" && protection.sourceKind === "cardEffect");

const hasOnlyBattleIrrelevantProtections = (
  protections: readonly Protection[],
): boolean => protections.every(battleProtectionIsIrrelevant);

type SupportedBattleCardView = ComputedCardView & {
  readonly currentPower: number;
};

const hasSupportedBattlePowerView = (
  cardView: ComputedCardView | undefined,
): cardView is SupportedBattleCardView => cardView?.currentPower !== undefined;

export type SupportedBattleCombatView = {
  readonly attacker: LocatedCombatCard;
  readonly target: LocatedCombatCard;
  readonly attackerView: SupportedBattleCardView;
  readonly targetView: SupportedBattleCardView;
  readonly view: ReturnType<typeof computeView>;
};

export type UnsupportedBattleCombatView = {
  readonly reason:
    | "Battle participants are stale or invalid."
    | "Battle requires unsupported combat metadata."
    | "Battle requires unsupported derived power metadata."
    | "Battle requires unsupported keyword or protection handling.";
};

export const getSupportedBattleCombatView = (
  state: GameState,
  battle: BattleState,
): SupportedBattleCombatView | UnsupportedBattleCombatView => {
  const attacker = reifyCardRef(state, battle.attacker);
  const target = reifyCardRef(state, battle.currentTarget);
  if (attacker === null || target === null) {
    return { reason: "Battle participants are stale or invalid." };
  }

  let view: ReturnType<typeof computeView>;
  try {
    view = computeView(state);
  } catch {
    return { reason: "Battle requires unsupported combat metadata." };
  }

  const attackerView = view.cards[attacker.card.instanceId];
  const targetView = view.cards[target.card.instanceId];
  if (
    !hasSupportedBattlePowerView(attackerView) ||
    !hasSupportedBattlePowerView(targetView)
  ) {
    return { reason: "Battle requires unsupported derived power metadata." };
  }
  if (
    targetView.protectedFrom.length > 0 &&
    !hasOnlyBattleIrrelevantProtections(targetView.protectedFrom)
  ) {
    return {
      reason: "Battle requires unsupported keyword or protection handling.",
    };
  }

  return { attacker, target, attackerView, targetView, view };
};

export const getSupportedBattleCombatViewOrNull = (
  state: GameState,
  battle: BattleState,
): SupportedBattleCombatView | null => {
  const result = getSupportedBattleCombatView(state, battle);
  return "reason" in result ? null : result;
};
