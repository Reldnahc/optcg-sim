import {
  cardPower,
  counterCardsToStopAttack,
  findVisibleCard,
  visibleCardValue,
  type BotFeatures,
} from "./bot-features.js";
import type {
  BotExplainableScore,
  BotScoreTerm,
  BotStrategicMode,
} from "./bot-types.js";
import type { DevVisibleAction } from "./dev-snapshot-types.js";

export interface BotCombatPlanChoice {
  readonly action: DevVisibleAction;
  readonly score: BotExplainableScore;
}

const score = (terms: readonly BotScoreTerm[]): BotExplainableScore => ({
  total: terms.reduce((total, term) => total + term.value, 0),
  terms: terms.filter((term) => term.value !== 0),
});

const term = (
  key: string,
  value: number,
  reason: string,
): BotScoreTerm => ({ key, value, reason });

const attackTargetScore = ({
  action,
  features,
  mode,
}: {
  readonly action: DevVisibleAction;
  readonly features: BotFeatures;
  readonly mode: BotStrategicMode;
}): BotExplainableScore | undefined => {
  if (action.type !== "declareAttack" || action.attack === undefined) {
    return undefined;
  }
  const attacker = findVisibleCard(
    features.snapshot,
    features.botPlayerId,
    action.attack.attackerInstanceId,
  );
  const target = findVisibleCard(
    features.snapshot,
    features.botPlayerId,
    action.attack.targetInstanceId,
  );
  const attackerPower = cardPower(attacker);
  const targetPower = cardPower(target);
  if (attackerPower === undefined || targetPower === undefined) {
    return undefined;
  }
  const cardsToStop = counterCardsToStopAttack(attackerPower, targetPower);
  if (cardsToStop === undefined) {
    return undefined;
  }
  const opponent =
    features.snapshot.players[features.botPlayerId]?.view.opponent;
  const attacksLeader =
    opponent?.leader.instanceId === action.attack.targetInstanceId;
  const attacksCharacter =
    opponent?.characters.some(
      (card) => card.instanceId === action.attack?.targetInstanceId,
    ) === true;
  const targetValue = visibleCardValue(target, { includeCounter: true });
  const pressureMultiplier =
    mode === "lethal" ? 120 : mode === "pressure" ? 75 : 35;
  const boardMultiplier =
    mode === "stabilize" || mode === "develop" ? 70 : 35;

  return score([
    term(
      "leader-pressure",
      attacksLeader ? cardsToStop * pressureMultiplier : 0,
      "attack leader by required counter cards",
    ),
    term(
      "board-removal",
      attacksCharacter
        ? (Math.min(260, targetValue / 45) * boardMultiplier) / 70
        : 0,
      "attack valuable rested character",
    ),
    term(
      "lethal",
      mode === "lethal" && attacksLeader ? 500 : 0,
      "lethal mode prioritizes leader attacks",
    ),
  ]);
};

export const chooseCombatPlanAction = ({
  actions,
  features,
  mode,
}: {
  readonly actions: readonly DevVisibleAction[];
  readonly features: BotFeatures;
  readonly mode: BotStrategicMode;
}): BotCombatPlanChoice | undefined =>
  actions
    .flatMap((action) => {
      const actionScore = attackTargetScore({ action, features, mode });
      return actionScore === undefined
        ? []
        : [{ action, score: actionScore }];
    })
    .sort((left, right) => right.score.total - left.score.total)[0];
