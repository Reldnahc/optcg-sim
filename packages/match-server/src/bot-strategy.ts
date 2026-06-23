import type { PlayerView } from "@optcg/types";

import { evaluateBotAction } from "./bot-action-evaluator.js";
import { scoreCombatAction } from "./bot-combat-evaluation.js";
import { relatedCardsForAction } from "./bot-context.js";
import { chooseDefaultBotDecision } from "./bot-default-profile.js";
import { redShanksBotProfile } from "./bot-red-shanks-profile.js";
import type {
  BotActionChoice,
  BotActionContext,
  BotBehaviorProfile,
  BotStrategy,
} from "./bot-types.js";

type BotPendingDecision = NonNullable<PlayerView["pendingDecision"]>;

type EvaluatedBotAction = {
  readonly action: BotActionContext["action"];
  readonly utility: number;
};

const usefulCounterUtilityFloor = 100;

const isCounterStepPassDecision = (
  decision: BotPendingDecision,
  battleStep: string | undefined,
): boolean =>
  battleStep === "counter" &&
  decision.type === "selectCards" &&
  decision.min === 0 &&
  decision.max === 0;

const chooseProfilePendingDecision = ({
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
    isCounterStepPassDecision(decision, battle?.step)
  ) {
    return undefined;
  }
  return profile.chooseDecision?.({ snapshot, botPlayerId });
};

const evaluatedVisibleActions = ({
  snapshot,
  botPlayerId,
  profile,
}: Parameters<BotStrategy["chooseAction"]>[0] & {
  readonly profile: BotBehaviorProfile;
}): readonly EvaluatedBotAction[] => {
  const actions = snapshot.players[botPlayerId]?.actions ?? [];
  const pendingDecision = snapshot.players[botPlayerId]?.view.pendingDecision;
  return actions.flatMap((action) => {
    const context = {
      snapshot,
      botPlayerId,
      action,
      relatedCards: relatedCardsForAction(snapshot, botPlayerId, action),
    };
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
    const utility = evaluateBotAction({
      context,
      pendingDecision,
      tacticalScore: scoreCombatAction(context),
      profileScore,
      cardScores: cardScores.filter(
        (score): score is number => typeof score === "number",
      ),
    });
    return utility === undefined ? [] : [{ action, utility }];
  });
};

const chooseBestAction = (
  evaluated: readonly EvaluatedBotAction[],
): BotActionContext["action"] | undefined =>
  [...evaluated].sort((left, right) => right.utility - left.utility)[0]?.action;

const visibleDecisionActionUtility = (
  action: BotActionContext["action"],
  pendingDecision: BotPendingDecision | undefined,
): number | undefined => {
  if (action.type !== "respondToDecision") {
    return undefined;
  }
  if (action.decisionPayment?.kind === "cardCost") {
    return 1_200;
  }
  if (
    action.decisionPayment?.kind === "paymentDeclined" ||
    action.responseKey === "decline"
  ) {
    return pendingDecision?.type === "payCost" ? 100 : 50;
  }
  if (pendingDecision?.type === "payCost") {
    return 1_200;
  }
  if (action.responseKey === "keep" || action.responseKey === "deny") {
    return 1_000;
  }
  return 150;
};

const chooseBestVisibleDecisionAction = (
  actions: readonly BotActionContext["action"][],
  pendingDecision: BotPendingDecision | undefined,
): BotActionContext["action"] | undefined =>
  chooseBestAction(
    actions.flatMap((action) => {
      const utility = visibleDecisionActionUtility(action, pendingDecision);
      return utility === undefined ? [] : [{ action, utility }];
    }),
  );

const chooseCounterStepPass = (
  decision: BotPendingDecision | undefined,
  battleStep: string | undefined,
  evaluated: readonly EvaluatedBotAction[],
): BotActionChoice | undefined => {
  if (
    decision === undefined ||
    !isCounterStepPassDecision(decision, battleStep)
  ) {
    return undefined;
  }
  const counterAction = chooseBestAction(
    evaluated
      .filter(({ action }) => action.type === "useCounter")
      .filter(({ utility }) => utility > usefulCounterUtilityFloor),
  );
  return counterAction === undefined
    ? {
        type: "respondToDecision",
        decisionId: decision.id,
        response: { type: "cards", cards: [] },
      }
    : { type: "submitAction", actionIndex: counterAction.index };
};

export const createBotStrategy = (
  profile: BotBehaviorProfile = {},
): BotStrategy => ({
  chooseAction({ snapshot, botPlayerId }): BotActionChoice | undefined {
    const player = snapshot.players[botPlayerId];
    const actions = player?.actions ?? [];
    const pendingDecision = player?.view.pendingDecision;
    const battleStep = player?.view.battle?.step;
    const botOwnsPendingDecision = pendingDecision?.playerId === botPlayerId;
    if (
      botOwnsPendingDecision &&
      !isCounterStepPassDecision(pendingDecision, battleStep)
    ) {
      const profileDecisionChoice = chooseProfilePendingDecision({
        snapshot,
        botPlayerId,
        profile,
      });
      if (profileDecisionChoice !== undefined) {
        return profileDecisionChoice;
      }
      const decisionAction = chooseBestVisibleDecisionAction(
        actions,
        pendingDecision,
      );
      if (decisionAction !== undefined) {
        return { type: "submitAction", actionIndex: decisionAction.index };
      }
      const pendingDecisionChoice = chooseDefaultBotDecision({
        snapshot,
        botPlayerId,
      });
      return pendingDecisionChoice;
    }
    const evaluated = evaluatedVisibleActions({
      snapshot,
      botPlayerId,
      profile,
    });
    const counterStepPass = chooseCounterStepPass(
      pendingDecision,
      battleStep,
      evaluated,
    );
    if (counterStepPass !== undefined) {
      return counterStepPass;
    }
    if (botOwnsPendingDecision) {
      const decisionAction = chooseBestVisibleDecisionAction(
        actions,
        pendingDecision,
      );
      if (decisionAction !== undefined) {
        return { type: "submitAction", actionIndex: decisionAction.index };
      }
      const pendingDecisionChoice = chooseDefaultBotDecision({
        snapshot,
        botPlayerId,
      });
      return pendingDecisionChoice;
    }
    const chosen = chooseBestAction(evaluated);
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
