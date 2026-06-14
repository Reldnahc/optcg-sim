import type { PlayerView } from "@optcg/types";

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
  BotActionContext,
  BotBehaviorProfile,
  BotStrategy,
} from "./bot-types.js";

const actionPlacementCard = ({
  action,
  relatedCards,
}: Pick<BotActionContext, "action" | "relatedCards">) => {
  const placementId = action.placement?.instanceId;
  return placementId === undefined
    ? undefined
    : relatedCards.find((card) => card.instanceId === placementId);
};

const playCardCounterPenalty = (
  context: Pick<BotActionContext, "action" | "relatedCards">,
): number => {
  const counter = actionPlacementCard(context)?.printedCounter ?? 0;
  if (counter >= 2_000) {
    return 26;
  }
  if (counter >= 1_000) {
    return 8;
  }
  return 0;
};

const playCardDevelopmentBonus = (
  context: Pick<BotActionContext, "action" | "relatedCards">,
): number => {
  const card = actionPlacementCard(context);
  if (card === undefined) {
    return 0;
  }
  const power = cardPower(card) ?? 0;
  const cost = card.currentCost ?? card.printedCost ?? 0;
  const blockerBonus = card.keywords?.includes("blocker") === true ? 2 : 0;
  return Math.min(16, power / 1_000 + cost * 1.5 + blockerBonus);
};

const playCardPriority = (
  context: Pick<BotActionContext, "action" | "relatedCards">,
): number =>
  28 - playCardDevelopmentBonus(context) + playCardCounterPenalty(context);

const baseActionPriority = (
  context: Pick<BotActionContext, "action" | "relatedCards">,
): number => {
  const { action } = context;
  if (
    action.type === "respondToDecision" &&
    action.decisionPayment?.kind === "cardCost"
  ) {
    return 5;
  }
  if (
    action.type === "respondToDecision" &&
    (action.responseKey === "keep" || action.responseKey === "deny")
  ) {
    return 0;
  }
  if (action.type === "activateEffect") return 10;
  if (action.type === "playCard") return playCardPriority(context);
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
  context: Pick<BotActionContext, "action" | "relatedCards">,
  scores: readonly (number | undefined)[],
): number => {
  const numericScores = scores.filter(
    (score): score is number => typeof score === "number",
  );
  return numericScores.length === 0
    ? baseActionPriority(context)
    : Math.min(...numericScores);
};

type BotPendingDecision = NonNullable<PlayerView["pendingDecision"]>;

const isCounterStepPassDecision = (
  decision: BotPendingDecision,
  battleStep: string | undefined,
): boolean =>
  battleStep === "counter" &&
  decision.type === "selectCards" &&
  decision.min === 0 &&
  decision.max === 0;

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
    isCounterStepPassDecision(decision, battle?.step)
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
          score: mergedScore(context, [
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
