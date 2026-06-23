import {
  cardPower,
  findVisibleCard,
  type BotFeatures,
  type BotVisibleActionFacts,
} from "./bot-features.js";
import type { BotVisibleCard } from "./bot-types.js";
import type { DevVisibleAction } from "./dev-snapshot-types.js";

const emptyVisibleActionFacts: BotVisibleActionFacts = {
  relatedCards: [],
  hasRemainingAttackAfterAttachment: true,
};

export interface BotActionCandidate {
  readonly action: DevVisibleAction;
  readonly relatedCards: readonly BotVisibleCard[];
  readonly facts: BotVisibleActionFacts;
}

export const buildBotActionCandidates = (
  features: BotFeatures,
): readonly BotActionCandidate[] =>
  (features.snapshot.players[features.botPlayerId]?.actions ?? []).map(
    (action) => {
      const facts =
        features.actions.byIndex.get(action.index) ?? emptyVisibleActionFacts;
      return {
        action,
        relatedCards: facts.relatedCards,
        facts,
      };
    },
  );

export const botCandidateIsLegalForScoring = ({
  candidate,
  features,
}: {
  readonly candidate: BotActionCandidate;
  readonly features: BotFeatures;
}): boolean => {
  const { action } = candidate;
  if (action.type === "concede") {
    return false;
  }
  if (action.type === "attachDon") {
    return candidate.facts.hasRemainingAttackAfterAttachment;
  }
  if (action.type !== "declareAttack") {
    return true;
  }
  const attack = action.attack;
  if (attack === undefined) {
    return false;
  }
  const attackerPower = cardPower(
    findVisibleCard(
      features.snapshot,
      features.botPlayerId,
      attack.attackerInstanceId,
    ),
  );
  const targetPower = cardPower(
    findVisibleCard(
      features.snapshot,
      features.botPlayerId,
      attack.targetInstanceId,
    ),
  );
  return (
    attackerPower !== undefined &&
    targetPower !== undefined &&
    attackerPower >= targetPower
  );
};
