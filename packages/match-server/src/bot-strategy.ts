import type { PlayerView } from "@optcg/types";

import {
  botCandidateIsLegalForScoring,
  buildBotActionCandidates,
} from "./bot-candidates.js";
import { chooseCombatPlanAction } from "./bot-combat-planner.js";
import { scoreCombatAction } from "./bot-combat-evaluation.js";
import { chooseBotDecisionResponse } from "./bot-decision-responder.js";
import { chooseDefaultBotDecision } from "./bot-default-profile.js";
import { buildBotFeatures, type BotFeatures } from "./bot-features.js";
import { redShanksBotProfile } from "./bot-red-shanks-profile.js";
import {
  botScoreBreakdownToExplainableScore,
  scoreBotCandidate,
  type BotScoreBreakdown,
  type ScoredBotCandidate,
} from "./bot-score.js";
import { chooseBotStrategicMode } from "./bot-strategic-mode.js";
import { chooseTurnPlan } from "./bot-turn-planner.js";
import { chooseBotTurnIntent, type BotTurnIntent } from "./bot-turn-intent.js";
import type {
  BotActionChoice,
  BotActionContext,
  BotBehaviorProfile,
  BotDecisionReason,
  BotExplainableScore,
  BotRejectedCandidate,
  BotSubmitActionChoice,
  BotStrategy,
} from "./bot-types.js";

type BotPendingDecision = NonNullable<PlayerView["pendingDecision"]>;

export interface BotStrategyActionReport {
  readonly choice: BotActionChoice;
  readonly score?: BotScoreBreakdown | undefined;
  readonly explainableScore?: BotExplainableScore | undefined;
  readonly intent?: BotTurnIntent | undefined;
  readonly decisionReason?: BotDecisionReason | undefined;
  readonly rejectedCandidates?: readonly BotRejectedCandidate[] | undefined;
}

const usefulCounterUtilityFloor = 100;

const isCounterStepPassDecision = (
  decision: BotPendingDecision,
  battleStep: string | undefined,
): boolean =>
  battleStep === "counter" &&
  decision.type === "selectCards" &&
  decision.min === 0 &&
  decision.max === 0;

const scoredVisibleActions = ({
  features,
  profile,
  intent,
}: {
  readonly features: BotFeatures;
  readonly profile: BotBehaviorProfile;
  readonly intent: BotTurnIntent;
}): readonly ScoredBotCandidate[] => {
  const { snapshot, botPlayerId } = features;
  const candidates = buildBotActionCandidates(features);
  const pendingDecision = snapshot.players[botPlayerId]?.view.pendingDecision;
  return candidates.flatMap((candidate) => {
    if (!botCandidateIsLegalForScoring({ candidate, features })) {
      return [];
    }
    const { action, relatedCards } = candidate;
    const context = {
      snapshot,
      botPlayerId,
      action,
      relatedCards,
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
    const scored = scoreBotCandidate({
      candidate,
      features,
      context,
      pendingDecision,
      intent,
      tacticalScore: scoreCombatAction(context, features),
      profileScore,
      cardScores: cardScores.filter(
        (score): score is number => typeof score === "number",
      ),
    });
    return [scored];
  });
};

const chooseBestScoredCandidate = (
  scored: readonly ScoredBotCandidate[],
): ScoredBotCandidate | undefined =>
  [...scored].sort(
    (left, right) => right.breakdown.total - left.breakdown.total,
  )[0];

const selectedDonInstanceIdsForAttachChoice = (
  chosenAction: BotActionContext["action"],
  actions: readonly BotActionContext["action"][],
): BotSubmitActionChoice["selectedDonInstanceIds"] | undefined => {
  const targetInstanceId = chosenAction.attachment?.targetInstanceId;
  if (chosenAction.type !== "attachDon" || targetInstanceId === undefined) {
    return undefined;
  }
  const selectedDonInstanceIds = [
    ...new Set(
      actions.flatMap((action) =>
        action.type === "attachDon" &&
        action.attachment?.targetInstanceId === targetInstanceId
          ? [action.attachment.donInstanceId]
          : [],
      ),
    ),
  ];
  return selectedDonInstanceIds.length > 1 ? selectedDonInstanceIds : undefined;
};

const firstVisibleDecisionAction = (
  actions: readonly BotActionContext["action"][],
): BotActionContext["action"] | undefined =>
  actions.find((action) => action.type === "respondToDecision");

const passiveDeclineDecisionAction = (
  actions: readonly BotActionContext["action"][],
): BotActionContext["action"] | undefined =>
  actions.find(
    (action) =>
      action.type === "respondToDecision" &&
      (action.responseKey === "decline" ||
        action.decisionPayment?.kind === "paymentDeclined"),
  );

const passiveEndMainPhaseAction = (
  actions: readonly BotActionContext["action"][],
): BotActionContext["action"] | undefined =>
  actions.find((action) => action.type === "endMainPhase");

// Counter-step pass still needs evaluated useCounter utilities. Move this into
// the responder after score breakdown exposes a structured counter term.
const chooseCounterStepPass = (
  decision: BotPendingDecision | undefined,
  battleStep: string | undefined,
  scored: readonly ScoredBotCandidate[],
  intent: BotTurnIntent,
): BotStrategyActionReport | undefined => {
  if (
    decision === undefined ||
    !isCounterStepPassDecision(decision, battleStep)
  ) {
    return undefined;
  }
  const counterCandidate = chooseBestScoredCandidate(
    scored
      .filter(({ candidate }) => candidate.action.type === "useCounter")
      .filter(({ breakdown }) => breakdown.total > usefulCounterUtilityFloor),
  );
  return counterCandidate === undefined
    ? {
        choice: {
          type: "respondToDecision",
          decisionId: decision.id,
          response: { type: "cards", cards: [] },
        },
        intent,
        decisionReason: { kind: "counter-step-pass" },
      }
    : {
        choice: {
          type: "submitAction",
          actionIndex: counterCandidate.candidate.action.index,
        },
        score: counterCandidate.breakdown,
        explainableScore: botScoreBreakdownToExplainableScore(
          counterCandidate.breakdown,
        ),
        intent,
      };
};

const decisionReport = (
  decisionResponse: ReturnType<typeof chooseBotDecisionResponse>,
  intent?: BotTurnIntent,
): BotStrategyActionReport | undefined =>
  decisionResponse === undefined
    ? undefined
    : {
        choice: decisionResponse.choice,
        intent,
        decisionReason: decisionResponse.reason,
      };

const profileDecisionReason = (
  profile: BotBehaviorProfile,
): BotDecisionReason =>
  profile.id === undefined
    ? { kind: "profile" }
    : { kind: "profile", profileId: profile.id };

const chooseStrategyActionReport = ({
  snapshot,
  botPlayerId,
  profile,
}: {
  readonly snapshot: BotActionContext["snapshot"];
  readonly botPlayerId: BotActionContext["botPlayerId"];
  readonly profile: BotBehaviorProfile;
}): BotStrategyActionReport | undefined => {
  const player = snapshot.players[botPlayerId];
  const actions = player?.actions ?? [];
  const pendingDecision = player?.view.pendingDecision;
  const battleStep = player?.view.battle?.step;
  const botOwnsPendingDecision = pendingDecision?.playerId === botPlayerId;
  if (
    botOwnsPendingDecision &&
    !isCounterStepPassDecision(pendingDecision, battleStep)
  ) {
    return decisionReport(
      chooseBotDecisionResponse({
        snapshot,
        botPlayerId,
        profile,
        visibleActions: actions,
      }),
      { type: "answerDecision" },
    );
  }
  const features = buildBotFeatures(snapshot, botPlayerId);
  const intent = chooseBotTurnIntent(features);
  const scored = scoredVisibleActions({
    features,
    profile,
    intent,
  });
  const counterStepPass = chooseCounterStepPass(
    pendingDecision,
    battleStep,
    scored,
    intent,
  );
  if (counterStepPass !== undefined) {
    return counterStepPass;
  }
  if (botOwnsPendingDecision) {
    return decisionReport(
      chooseBotDecisionResponse({
        snapshot,
        botPlayerId,
        profile,
        visibleActions: actions,
      }),
      intent,
    );
  }
  const modeReport = chooseBotStrategicMode(features);
  const plannerActions = [
    ...new Map(
      scored.map(({ candidate }) => [candidate.action.index, candidate.action]),
    ).values(),
  ];
  const turnPlan = chooseTurnPlan({
    actions: plannerActions,
    features,
    mode: modeReport.mode,
  });
  if (turnPlan !== undefined && turnPlan.score.total > 0) {
    const firstStep = turnPlan.steps[0];
    if (firstStep === undefined) {
      return undefined;
    }
    const plannedAction = actions.find(
      (action) => action.index === firstStep.actionIndex,
    );
    return {
      choice: {
        type: "submitAction",
        actionIndex: firstStep.actionIndex,
        ...(() => {
          const selectedDonInstanceIds =
            plannedAction === undefined
              ? undefined
              : selectedDonInstanceIdsForAttachChoice(plannedAction, actions);
          return selectedDonInstanceIds === undefined
            ? {}
            : { selectedDonInstanceIds };
        })(),
      },
      explainableScore: turnPlan.score,
      intent,
    };
  }
  const hasOnlyCombatActions =
    actions.length > 0 &&
    actions.every((action) => action.type === "declareAttack");
  if (hasOnlyCombatActions) {
    if (modeReport.mode === "pressure" && features.opponent.lifeCount <= 2) {
      const combatPlan = chooseCombatPlanAction({
        actions,
        features,
        mode: modeReport.mode,
      });
      if (combatPlan !== undefined && combatPlan.score.total > 0) {
        return {
          choice: {
            type: "submitAction",
            actionIndex: combatPlan.action.index,
          },
          explainableScore: combatPlan.score,
          intent,
        };
      }
    }
  }
  const chosen = chooseBestScoredCandidate(scored);
  if (chosen !== undefined) {
    return {
      choice: {
        type: "submitAction",
        actionIndex: chosen.candidate.action.index,
        ...(() => {
          const selectedDonInstanceIds = selectedDonInstanceIdsForAttachChoice(
            chosen.candidate.action,
            actions,
          );
          return selectedDonInstanceIds === undefined
            ? {}
            : { selectedDonInstanceIds };
        })(),
      },
      score: chosen.breakdown,
      explainableScore: botScoreBreakdownToExplainableScore(chosen.breakdown),
      intent,
    };
  }
  const profileDecision = profile.chooseDecision?.({ snapshot, botPlayerId });
  if (profileDecision !== undefined) {
    return {
      choice: profileDecision,
      decisionReason: profileDecisionReason(profile),
    };
  }
  return decisionReport(
    chooseBotDecisionResponse({
      snapshot,
      botPlayerId,
      profile: {},
      visibleActions: actions,
    }),
  );
};

export const createBotStrategy = (
  profile: BotBehaviorProfile = {},
): BotStrategy => ({
  chooseAction(input): BotActionChoice | undefined {
    return chooseStrategyActionReport({ ...input, profile })?.choice;
  },
});

export const createPassiveBotStrategy = (): BotStrategy => ({
  chooseAction({ snapshot, botPlayerId }): BotActionChoice | undefined {
    const player = snapshot.players[botPlayerId];
    const actions = player?.actions ?? [];
    const pendingDecision = player?.view.pendingDecision;
    const botOwnsPendingDecision = pendingDecision?.playerId === botPlayerId;
    if (botOwnsPendingDecision) {
      const visibleDecisionAction =
        passiveDeclineDecisionAction(actions) ??
        firstVisibleDecisionAction(actions);
      if (visibleDecisionAction !== undefined) {
        return {
          type: "submitAction",
          actionIndex: visibleDecisionAction.index,
        };
      }
      return chooseDefaultBotDecision({ snapshot, botPlayerId });
    }
    const endMainPhase = passiveEndMainPhaseAction(actions);
    return endMainPhase === undefined
      ? undefined
      : { type: "submitAction", actionIndex: endMainPhase.index };
  },
});

export const passiveBotStrategy = createPassiveBotStrategy();

export const chooseBotActionReport = (input: {
  readonly snapshot: BotActionContext["snapshot"];
  readonly botPlayerId: BotActionContext["botPlayerId"];
  readonly profile?: BotBehaviorProfile | undefined;
}): BotStrategyActionReport | undefined =>
  chooseStrategyActionReport({
    snapshot: input.snapshot,
    botPlayerId: input.botPlayerId,
    profile: input.profile ?? redShanksBotProfile,
  });

export const defaultBotStrategy = createBotStrategy(redShanksBotProfile);
