import type { DevVisibleAction } from "./dev-snapshot-types.js";
import { scoreCombatAction } from "./bot-combat-evaluation.js";
import {
  cardPower,
  findVisibleCard,
  relatedCardsForAction,
} from "./bot-context.js";
import { chooseDefaultBotDecision } from "./bot-default-profile.js";
import { redShanksBotProfile } from "./bot-red-shanks-profile.js";
import type {
  BotActionChoice,
  BotBehaviorProfile,
  BotStrategy,
} from "./bot-types.js";

const baseActionPriority = (action: DevVisibleAction): number => {
  if (
    action.type === "respondToDecision" &&
    (action.responseKey === "keep" || action.responseKey === "deny")
  ) {
    return 0;
  }
  if (action.type === "activateEffect") return 10;
  if (action.type === "playCard") return 20;
  if (action.type === "attachDon") return 30;
  if (action.type === "declareAttack") return 40;
  if (action.type === "advanceToMainPhase") return 50;
  if (action.type === "respondToDecision") return 60;
  if (action.type === "endMainPhase") return 90;
  if (action.type === "concede") return 10_000;
  return 100;
};

const defaultActionAllowed = ({
  snapshot,
  botPlayerId,
  action,
}: Parameters<NonNullable<BotBehaviorProfile["scoreAction"]>>[0]): boolean => {
  if (action.type === "concede") {
    return false;
  }
  if (action.type !== "declareAttack") {
    return true;
  }
  const attack = action.attack;
  if (attack === undefined) {
    return false;
  }
  const attackerPower = cardPower(
    findVisibleCard(snapshot, botPlayerId, attack.attackerInstanceId),
  );
  const targetPower = cardPower(
    findVisibleCard(snapshot, botPlayerId, attack.targetInstanceId),
  );
  return (
    attackerPower !== undefined &&
    targetPower !== undefined &&
    attackerPower >= targetPower
  );
};

const mergedScore = (
  action: DevVisibleAction,
  scores: readonly (number | undefined)[],
): number => {
  const numericScores = scores.filter(
    (score): score is number => typeof score === "number",
  );
  return numericScores.length === 0
    ? baseActionPriority(action)
    : Math.min(...numericScores);
};

const choosePendingDecision = ({
  snapshot,
  botPlayerId,
  profile,
}: Parameters<BotStrategy["chooseAction"]>[0] & {
  readonly profile: BotBehaviorProfile;
}): BotActionChoice | undefined => {
  const decision = snapshot.players[botPlayerId]?.view.pendingDecision;
  const battle = snapshot.players[botPlayerId]?.view.battle;
  if (
    decision === undefined ||
    decision.playerId !== botPlayerId ||
    decision.type === "payCost" ||
    decision.type === "mulligan" ||
    battle?.step === "counter"
  ) {
    return undefined;
  }
  return (
    profile.chooseDecision?.({ snapshot, botPlayerId }) ??
    chooseDefaultBotDecision({ snapshot, botPlayerId })
  );
};

export const createBotStrategy = (
  profile: BotBehaviorProfile = {},
): BotStrategy => ({
  chooseAction({ snapshot, botPlayerId }): BotActionChoice | undefined {
    const pendingDecisionChoice = choosePendingDecision({
      snapshot,
      botPlayerId,
      profile,
    });
    if (pendingDecisionChoice !== undefined) {
      return pendingDecisionChoice;
    }
    const actions = snapshot.players[botPlayerId]?.actions ?? [];
    const scored = actions.flatMap((action) => {
      const context = {
        snapshot,
        botPlayerId,
        action,
        relatedCards: relatedCardsForAction(snapshot, botPlayerId, action),
      };
      if (!defaultActionAllowed(context)) {
        return [];
      }
      const combatScore = scoreCombatAction(context);
      const profileScore = profile.scoreAction?.(context);
      if (profileScore === false) {
        return [];
      }
      const cardScores = context.relatedCards.map((card) =>
        profile.cardBehaviors?.[String(card.cardId)]?.scoreAction?.(context),
      );
      if (cardScores.some((score) => score === false)) {
        return [];
      }
      const numericCardScores = cardScores.filter(
        (score): score is number => typeof score === "number",
      );
      return [
        {
          action,
          score: mergedScore(action, [
            combatScore,
            profileScore,
            ...numericCardScores,
          ]),
        },
      ];
    });
    const chosen = scored.sort((left, right) => left.score - right.score)[0]
      ?.action;
    if (chosen !== undefined) {
      return { type: "submitAction", actionIndex: chosen.index };
    }
    return (
      profile.chooseDecision?.({ snapshot, botPlayerId }) ??
      chooseDefaultBotDecision({ snapshot, botPlayerId })
    );
  },
});

export const defaultBotStrategy = createBotStrategy(redShanksBotProfile);
