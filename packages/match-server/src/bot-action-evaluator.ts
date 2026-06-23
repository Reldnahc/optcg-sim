import type { PlayerView } from "@optcg/types";

import {
  botCandidateIsLegalForScoring,
  type BotActionCandidate,
} from "./bot-candidates.js";
import type { BotFeatures } from "./bot-features.js";
import { scoreBotCandidate } from "./bot-score.js";
import type { BotActionContext } from "./bot-types.js";

type BotPendingDecision = NonNullable<PlayerView["pendingDecision"]>;

export interface BotActionEvaluationInput {
  readonly context: BotActionContext;
  readonly features: BotFeatures;
  readonly pendingDecision?: BotPendingDecision | undefined;
  readonly tacticalScore?: number | undefined;
  readonly profileScore?: number | undefined;
  readonly cardScores: readonly number[];
}

const candidateFromEvaluationInput = ({
  context,
  features,
}: Pick<
  BotActionEvaluationInput,
  "context" | "features"
>): BotActionCandidate => {
  const facts = features.actions.byIndex.get(context.action.index) ?? {
    relatedCards: context.relatedCards,
    hasRemainingAttackAfterAttachment: true,
    hasUsefulDonAttachment: true,
    donAttachmentUse: "unknown" as const,
  };
  return {
    action: context.action,
    relatedCards: context.relatedCards,
    facts,
  };
};

export const evaluateBotAction = (
  input: BotActionEvaluationInput,
): number | undefined => {
  const candidate = candidateFromEvaluationInput(input);
  if (
    !botCandidateIsLegalForScoring({
      candidate,
      features: input.features,
    })
  ) {
    return undefined;
  }
  const scored = scoreBotCandidate({
    candidate,
    features: input.features,
    context: input.context,
    pendingDecision: input.pendingDecision,
    tacticalScore: input.tacticalScore,
    profileScore: input.profileScore,
    cardScores: input.cardScores,
  });
  return scored.breakdown.total;
};
