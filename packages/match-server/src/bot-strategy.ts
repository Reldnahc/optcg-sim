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

const isCounterStepPassDecision = (
  decision: BotPendingDecision,
  battleStep: string | undefined,
): boolean =>
  battleStep === "counter" &&
  decision.type === "selectCards" &&
  decision.min === 0 &&
  decision.max === 0;

const shouldPreferVisibleDecisionAction = (
  decision: BotPendingDecision | undefined,
  battleStep: string | undefined,
): boolean => {
  if (
    decision === undefined ||
    isCounterStepPassDecision(decision, battleStep)
  ) {
    return false;
  }
  switch (decision.type) {
    case "payCost":
    case "mulligan":
    case "chooseEffectOption":
    case "chooseReplacement":
      return true;
    case "chooseQuantity":
    case "selectCards":
    case "selectTargets":
    case "orderCards":
    case "chooseTriggerOrder":
    case "confirmLifeTrigger":
    case "chooseOptionalActivation":
    case "declareLoopCount":
    case "rollbackConsent":
      return false;
  }
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
    isCounterStepPassDecision(decision, battle?.step)
  ) {
    return undefined;
  }
  return (
    profile.chooseDecision?.({ snapshot, botPlayerId }) ??
    chooseDefaultBotDecision({ snapshot, botPlayerId })
  );
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

const chooseBestVisibleDecisionAction = (
  evaluated: readonly EvaluatedBotAction[],
): BotActionContext["action"] | undefined =>
  chooseBestAction(
    evaluated.filter(({ action }) => action.type === "respondToDecision"),
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
    evaluated.filter(({ action }) => action.type === "useCounter"),
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
    const evaluated = evaluatedVisibleActions({
      snapshot,
      botPlayerId,
      profile,
    });
    const player = snapshot.players[botPlayerId];
    const pendingDecision = player?.view.pendingDecision;
    const battleStep = player?.view.battle?.step;
    const counterStepPass = chooseCounterStepPass(
      pendingDecision,
      battleStep,
      evaluated,
    );
    if (counterStepPass !== undefined) {
      return counterStepPass;
    }
    if (
      pendingDecision?.playerId === botPlayerId &&
      shouldPreferVisibleDecisionAction(pendingDecision, battleStep)
    ) {
      const decisionAction = chooseBestVisibleDecisionAction(evaluated);
      if (decisionAction !== undefined) {
        return { type: "submitAction", actionIndex: decisionAction.index };
      }
    }
    const pendingDecisionChoice = choosePendingDecision({
      snapshot,
      botPlayerId,
      profile,
    });
    if (pendingDecisionChoice !== undefined) {
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
