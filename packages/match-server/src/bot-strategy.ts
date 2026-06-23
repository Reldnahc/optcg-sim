import type { PlayerView } from "@optcg/types";

import {
  botCandidateIsLegalForScoring,
  buildBotActionCandidates,
} from "./bot-candidates.js";
import { scoreCombatAction } from "./bot-combat-evaluation.js";
import { chooseBotDecisionResponse } from "./bot-decision-responder.js";
import { buildBotFeatures, type BotFeatures } from "./bot-features.js";
import { redShanksBotProfile } from "./bot-red-shanks-profile.js";
import {
  scoreBotCandidate,
  type BotScoreBreakdown,
  type ScoredBotCandidate,
} from "./bot-score.js";
import type {
  BotActionChoice,
  BotActionContext,
  BotBehaviorProfile,
  BotDecisionReason,
  BotStrategy,
} from "./bot-types.js";

type BotPendingDecision = NonNullable<PlayerView["pendingDecision"]>;

export interface BotStrategyActionReport {
  readonly choice: BotActionChoice;
  readonly score?: BotScoreBreakdown | undefined;
  readonly decisionReason?: BotDecisionReason | undefined;
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
}: {
  readonly features: BotFeatures;
  readonly profile: BotBehaviorProfile;
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

// Counter-step pass still needs evaluated useCounter utilities. Move this into
// the responder after score breakdown exposes a structured counter term.
const chooseCounterStepPass = (
  decision: BotPendingDecision | undefined,
  battleStep: string | undefined,
  scored: readonly ScoredBotCandidate[],
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
        decisionReason: { kind: "counter-step-pass" },
      }
    : {
        choice: {
          type: "submitAction",
          actionIndex: counterCandidate.candidate.action.index,
        },
        score: counterCandidate.breakdown,
      };
};

const decisionReport = (
  decisionResponse: ReturnType<typeof chooseBotDecisionResponse>,
): BotStrategyActionReport | undefined =>
  decisionResponse === undefined
    ? undefined
    : {
        choice: decisionResponse.choice,
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
    );
  }
  const features = buildBotFeatures(snapshot, botPlayerId);
  const scored = scoredVisibleActions({
    features,
    profile,
  });
  const counterStepPass = chooseCounterStepPass(
    pendingDecision,
    battleStep,
    scored,
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
    );
  }
  const chosen = chooseBestScoredCandidate(scored);
  if (chosen !== undefined) {
    return {
      choice: {
        type: "submitAction",
        actionIndex: chosen.candidate.action.index,
      },
      score: chosen.breakdown,
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
