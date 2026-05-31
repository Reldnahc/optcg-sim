import type { GameState, ResolvedCard } from "@optcg/types";

import { reifyCardRef } from "./action-state.js";
import { withAllAttackTimingCombatMetadataHidden } from "./attack-timing.js";
import {
  getUnsupportedBattleEffectMetadataReason,
  isSupportedBattleResolutionEnvelope,
  sameCardRef,
} from "./battle-support.js";
import { computeView } from "./compute-view.js";
import { detectPendingRuntimeWork } from "./effect-runtime.js";
import { hasOnlyFieldRemovalProtections } from "./field-removal-protection.js";
import {
  getSupportedLifeTriggerDecision,
  hasLifeTriggerText,
} from "./life-trigger-actions.js";

const isSupportedDoubleAttackDamageSource = (
  card: ResolvedCard | undefined,
): card is ResolvedCard => {
  const printedKeywords = card?.printedKeywords ?? [];
  return (
    card?.support.status === "implemented-dsl" &&
    card.support.effectDefinitionId === undefined &&
    (card.effectText ?? "").trim().length === 0 &&
    (card.triggerText ?? "").trim().length === 0 &&
    printedKeywords.includes("doubleAttack") &&
    !printedKeywords.includes("banish")
  );
};

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
  const baseCombatMetadataState =
    withAllAttackTimingCombatMetadataHidden(state);
  const attackerMetadata = state.cardManifest.cards[battle.attacker.cardId];
  const combatMetadataState =
    battle.damageCount === 2 &&
    isSupportedDoubleAttackDamageSource(attackerMetadata)
      ? {
          ...baseCombatMetadataState,
          cardManifest: {
            ...baseCombatMetadataState.cardManifest,
            cards: {
              ...baseCombatMetadataState.cardManifest.cards,
              [battle.attacker.cardId]: {
                ...attackerMetadata,
                printedKeywords: attackerMetadata.printedKeywords.filter(
                  (keyword) => keyword !== "doubleAttack",
                ),
              },
            },
          },
        }
      : baseCombatMetadataState;
  const unsupportedEffectMetadataReason =
    getUnsupportedBattleEffectMetadataReason(combatMetadataState);
  if (unsupportedEffectMetadataReason !== undefined) {
    return unsupportedEffectMetadataReason;
  }
  const attacker = reifyCardRef(state, battle.attacker);
  const target = reifyCardRef(state, battle.currentTarget);
  if (attacker === null || target === null) {
    return "Battle participants are stale or invalid.";
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

  let view: ReturnType<typeof computeView>;
  try {
    view = computeView(combatMetadataState);
  } catch {
    return "Battle requires unsupported combat metadata.";
  }
  if (Object.keys(view.restrictions).length > 0) {
    return "Battle requires unsupported restriction handling.";
  }

  const attackerView = view.cards[attacker.card.instanceId];
  const targetView = view.cards[target.card.instanceId];
  if (
    attackerView?.currentPower === undefined ||
    targetView?.currentPower === undefined
  ) {
    return "Battle requires unsupported derived power metadata.";
  }
  if (
    (battle.damageCount !== 2 &&
      attackerView.keywords.includes("doubleAttack")) ||
    (targetView.protectedFrom.length > 0 &&
      !hasOnlyFieldRemovalProtections(targetView.protectedFrom))
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
      target.card.state !== "rested"
    ) {
      return "Battle target is no longer a supported rested character target.";
    }
  }
  if (
    attackerView.currentPower >= targetView.currentPower &&
    target.isLeader &&
    !attackerView.keywords.includes("banish")
  ) {
    const targetPlayer = state.players[target.playerId];
    const topLife = targetPlayer?.life[0];
    const topLifeMeta =
      topLife && state.cardManifest.cards[topLife.card.cardId];
    if (
      topLife !== undefined &&
      hasLifeTriggerText(topLifeMeta?.triggerText) &&
      getSupportedLifeTriggerDecision(state, target.playerId, topLife.card) ===
        undefined
    ) {
      return "Life trigger reveal decisions are unsupported in this battle path.";
    }
  }

  return undefined;
};
