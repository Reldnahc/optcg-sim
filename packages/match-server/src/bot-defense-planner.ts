import type { CardRef } from "@optcg/types";

import {
  cardPower,
  findVisibleCard,
  visibleCardValue,
  type BotFeatures,
} from "./bot-features.js";
import { counterPowerRequiredToStopAttack } from "./bot-gameplay-doctrine.js";
import type { BotDecisionContext } from "./bot-types.js";

export interface BotDefenseChoice {
  readonly cards: readonly CardRef[];
  readonly reason: string;
}

const battlePowers = ({
  snapshot,
  botPlayerId,
}: BotDecisionContext):
  | { readonly attackerPower: number; readonly targetPower: number }
  | undefined => {
  const battle = snapshot.players[botPlayerId]?.view.battle;
  if (battle === undefined) {
    return undefined;
  }
  const attackerPower = cardPower(
    findVisibleCard(snapshot, botPlayerId, battle.attacker.instanceId),
  );
  const targetPower = cardPower(
    findVisibleCard(snapshot, botPlayerId, battle.currentTarget.instanceId),
  );
  return attackerPower === undefined || targetPower === undefined
    ? undefined
    : { attackerPower, targetPower };
};

const isLeaderTarget = ({
  snapshot,
  botPlayerId,
}: BotDecisionContext): boolean => {
  const view = snapshot.players[botPlayerId]?.view;
  return (
    view?.battle?.currentTarget.instanceId !== undefined &&
    view.battle.currentTarget.instanceId === view.self.leader.instanceId
  );
};

const isLethal = (context: BotDecisionContext): boolean => {
  const view = context.snapshot.players[context.botPlayerId]?.view;
  const battle = view?.battle;
  const powers = battlePowers(context);
  if (view === undefined || battle === undefined || powers === undefined) {
    return false;
  }
  return (
    isLeaderTarget(context) &&
    powers.attackerPower >= powers.targetPower &&
    battle.damageCount > view.self.life.count
  );
};

const currentBattleTargetValue = (context: BotDecisionContext): number => {
  const battle = context.snapshot.players[context.botPlayerId]?.view.battle;
  return visibleCardValue(
    battle === undefined
      ? undefined
      : findVisibleCard(
          context.snapshot,
          context.botPlayerId,
          battle.currentTarget.instanceId,
        ),
    { includeCounter: true },
  );
};

const botDeckCounterDensityIsHigh = (features: BotFeatures): boolean =>
  features.opponentDeckKnowledge?.remainingUnknownCounterPrior
    .averageCounterPower !== undefined &&
  features.opponentDeckKnowledge.remainingUnknownCounterPrior
    .averageCounterPower >= 1_700;

export const chooseCounterCardsForDefense = ({
  context,
  features,
}: {
  readonly context: BotDecisionContext;
  readonly features: BotFeatures;
}): BotDefenseChoice | undefined => {
  const decision =
    context.snapshot.players[context.botPlayerId]?.view.pendingDecision;
  if (
    decision?.type !== "selectCards" ||
    decision.playerId !== context.botPlayerId
  ) {
    return undefined;
  }
  const powers = battlePowers(context);
  if (powers === undefined) {
    return undefined;
  }
  const required = counterPowerRequiredToStopAttack(powers);
  if (required === undefined) {
    return { cards: [], reason: "attack is not live" };
  }
  const shouldDefend =
    isLethal(context) ||
    features.self.lifeCount <= 1 ||
    (isLeaderTarget(context) && features.self.lifeCount <= 4) ||
    (!isLeaderTarget(context) && currentBattleTargetValue(context) >= 8_000) ||
    (isLeaderTarget(context) &&
      features.self.lifeCount <= 2 &&
      botDeckCounterDensityIsHigh(features));
  if (!shouldDefend) {
    return { cards: [], reason: "life or target can be spent" };
  }

  const sorted = decision.choices
    .filter((choice) => choice.selectable)
    .map((choice) => ({
      card: choice.card,
      counter:
        findVisibleCard(
          context.snapshot,
          context.botPlayerId,
          choice.card.instanceId,
        )?.printedCounter ?? 0,
    }))
    .filter((choice) => choice.counter > 0)
    .sort((left, right) => left.counter - right.counter);

  const chosen: CardRef[] = [];
  let total = 0;
  for (const choice of sorted) {
    if (total >= required) {
      break;
    }
    chosen.push(choice.card);
    total += choice.counter;
  }
  return total >= required
    ? { cards: chosen, reason: "defense reaches required counter" }
    : undefined;
};
