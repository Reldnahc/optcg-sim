import type { PlayerView } from "@optcg/types";

import { evaluateBotAction } from "./bot-action-evaluator.js";
import { scoreCombatAction } from "./bot-combat-evaluation.js";
import { chooseBotDecisionResponse } from "./bot-decision-responder.js";
import { buildBotFeatures, type BotFeatures } from "./bot-features.js";
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

const evaluatedVisibleActions = ({
  features,
  profile,
}: {
  readonly features: BotFeatures;
  readonly profile: BotBehaviorProfile;
}): readonly EvaluatedBotAction[] => {
  const { snapshot, botPlayerId } = features;
  const actions = snapshot.players[botPlayerId]?.actions ?? [];
  const pendingDecision = snapshot.players[botPlayerId]?.view.pendingDecision;
  return actions.flatMap((action) => {
    const context = {
      snapshot,
      botPlayerId,
      action,
      relatedCards:
        features.actions.byIndex.get(action.index)?.relatedCards ?? [],
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

// Counter-step pass still needs evaluated useCounter utilities. Move this into
// the responder after score breakdown exposes a structured counter term.
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
    const features = buildBotFeatures(snapshot, botPlayerId);
    const player = snapshot.players[botPlayerId];
    const actions = player?.actions ?? [];
    const pendingDecision = player?.view.pendingDecision;
    const battleStep = player?.view.battle?.step;
    const botOwnsPendingDecision = pendingDecision?.playerId === botPlayerId;
    if (
      botOwnsPendingDecision &&
      !isCounterStepPassDecision(pendingDecision, battleStep)
    ) {
      const decisionResponse = chooseBotDecisionResponse({
        snapshot,
        botPlayerId,
        profile,
        visibleActions: actions,
      });
      return decisionResponse?.choice;
    }
    const evaluated = evaluatedVisibleActions({
      features,
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
      const decisionResponse = chooseBotDecisionResponse({
        snapshot,
        botPlayerId,
        profile,
        visibleActions: actions,
      });
      return decisionResponse?.choice;
    }
    const chosen = chooseBestAction(evaluated);
    if (chosen !== undefined) {
      return { type: "submitAction", actionIndex: chosen.index };
    }
    return (
      profile.chooseDecision?.({ snapshot, botPlayerId }) ??
      chooseBotDecisionResponse({
        snapshot,
        botPlayerId,
        profile: {},
        visibleActions: actions,
      })?.choice
    );
  },
});

export const defaultBotStrategy = createBotStrategy(redShanksBotProfile);
