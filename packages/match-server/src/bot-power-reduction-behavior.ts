import type { CardId, CardRef, InstanceId, PublicCardView } from "@optcg/types";

import { cardPower, findVisibleCard } from "./bot-context.js";
import type { BotDeckProfileData } from "./bot-profile-types.js";
import type {
  BotActionContext,
  BotDecisionChoice,
  BotDecisionContext,
} from "./bot-types.js";

export interface BotPowerReductionBehavior {
  readonly amount: number;
  readonly target: "opponentCharacter" | "currentAttacker";
  readonly restsSource?: boolean;
}

export type BotPowerReductionBehaviors = Readonly<
  Partial<Record<string, BotPowerReductionBehavior>>
>;

type PowerReductionTarget = CardRef | PublicCardView;

interface TargetEvaluation<TCard extends PowerReductionTarget> {
  readonly card: TCard;
  readonly score: number;
}

const sourceCardForAction = ({
  action,
  relatedCards,
}: BotActionContext): PublicCardView | undefined => {
  const sourceId = action.placement?.instanceId;
  return sourceId === undefined
    ? undefined
    : relatedCards.find((card) => card.instanceId === sourceId);
};

const sourceBehavior = (
  sourceCardId: CardId | undefined,
  behaviors: BotPowerReductionBehaviors,
): BotPowerReductionBehavior | undefined =>
  sourceCardId === undefined ? undefined : behaviors[String(sourceCardId)];

const resolvedCard = (
  context: BotDecisionContext,
  card: PowerReductionTarget,
): PublicCardView | undefined =>
  isPublicCardView(card)
    ? card
    : findVisibleCard(context.snapshot, context.botPlayerId, card.instanceId);

const isPublicCardView = (card: PowerReductionTarget): card is PublicCardView =>
  "zone" in card;

const visiblePower = (
  context: BotDecisionContext,
  card: PowerReductionTarget,
): number | undefined =>
  isPublicCardView(card)
    ? cardPower(card)
    : cardPower(resolvedCard(context, card));

const isFreshCharacterWithoutRush = (
  snapshot: BotDecisionContext["snapshot"],
  card: PublicCardView,
): boolean =>
  card.zone.zone === "characterArea" &&
  card.turnPlayed === snapshot.turn.globalTurn &&
  card.keywords?.includes("rush") !== true &&
  card.keywords?.includes("rushCharacter") !== true;

const availableAttackers = (
  context: BotDecisionContext,
  sourceInstanceId: InstanceId | undefined,
  behavior: BotPowerReductionBehavior,
): readonly PublicCardView[] => {
  const view = context.snapshot.players[context.botPlayerId]?.view;
  if (
    view === undefined ||
    context.snapshot.turn.phase !== "main" ||
    (context.snapshot.turn.playerTurnCounts[context.botPlayerId] ?? 0) <= 1
  ) {
    return [];
  }
  return [view.self.leader, ...view.self.characters].filter((card) => {
    if (card.state === "rested") {
      return false;
    }
    if (
      behavior.restsSource === true &&
      sourceInstanceId !== undefined &&
      card.instanceId === sourceInstanceId
    ) {
      return false;
    }
    return !isFreshCharacterWithoutRush(context.snapshot, card);
  });
};

const targetCardScore = (
  card: PublicCardView | undefined,
  fallbackPower: number,
): number => {
  const power = cardPower(card) ?? fallbackPower;
  const cost = card?.currentCost ?? card?.printedCost ?? 0;
  const blockerBonus = card?.keywords?.includes("blocker") === true ? 1_500 : 0;
  return power + cost * 700 + blockerBonus;
};

const evaluatePowerReductionTarget = (
  context: BotDecisionContext,
  behavior: BotPowerReductionBehavior,
  target: PowerReductionTarget,
  sourceInstanceId?: InstanceId,
): TargetEvaluation<typeof target> | undefined => {
  const targetView = resolvedCard(context, target);
  const targetPower = visiblePower(context, target);
  if (targetPower === undefined) {
    return undefined;
  }
  const reducedPower = Math.max(0, targetPower - behavior.amount);
  const enablingAttacker = availableAttackers(
    context,
    sourceInstanceId,
    behavior,
  )
    .map((attacker) => cardPower(attacker) ?? 0)
    .filter((attackerPower) => attackerPower < targetPower)
    .filter((attackerPower) => attackerPower >= reducedPower)
    .sort((left, right) => right - left)[0];
  if (enablingAttacker === undefined) {
    return undefined;
  }
  return {
    card: target,
    score:
      targetCardScore(targetView, targetPower) +
      behavior.amount -
      Math.max(0, targetPower - enablingAttacker),
  };
};

const sortedTargetEvaluations = <TCard extends PowerReductionTarget>(
  context: BotDecisionContext,
  behavior: BotPowerReductionBehavior,
  targets: readonly TCard[],
  sourceInstanceId?: InstanceId,
): readonly TargetEvaluation<TCard>[] =>
  targets
    .map((target) =>
      evaluatePowerReductionTarget(context, behavior, target, sourceInstanceId),
    )
    .filter(
      (evaluation): evaluation is TargetEvaluation<TCard> =>
        evaluation !== undefined,
    )
    .sort((left, right) => right.score - left.score);

const opponentCharacterTargets = (
  context: BotDecisionContext,
): readonly PublicCardView[] =>
  context.snapshot.players[context.botPlayerId]?.view.opponent.characters ?? [];

const currentAttackerTarget = (
  context: BotDecisionContext,
  candidates: readonly PowerReductionTarget[],
): readonly PowerReductionTarget[] => {
  const attacker =
    context.snapshot.players[context.botPlayerId]?.view.battle?.attacker;
  if (attacker === undefined) {
    return [];
  }
  return candidates.filter(
    (candidate) => candidate.instanceId === attacker.instanceId,
  );
};

const targetsForBehavior = (
  context: BotDecisionContext,
  behavior: BotPowerReductionBehavior,
  candidates?: readonly PowerReductionTarget[],
): readonly PowerReductionTarget[] => {
  if (behavior.target === "currentAttacker") {
    return currentAttackerTarget(context, candidates ?? []);
  }
  return candidates ?? opponentCharacterTargets(context);
};

export const powerReductionBehaviorsFromProfile = (
  profile: BotDeckProfileData,
): BotPowerReductionBehaviors =>
  Object.fromEntries(
    profile.effectPolicies.map((policy) => [
      policy.sourceCardId,
      {
        amount: policy.amount,
        target: policy.target,
        restsSource: policy.restsSource,
      },
    ]),
  );

export const scorePowerReductionAction = (
  context: BotActionContext,
  behaviors: BotPowerReductionBehaviors,
): number | false | undefined => {
  if (context.action.type !== "activateEffect") {
    return undefined;
  }
  const source = sourceCardForAction(context);
  const behavior = sourceBehavior(source?.cardId, behaviors);
  if (behavior === undefined) {
    return undefined;
  }
  const targets = targetsForBehavior(context, behavior);
  const bestTarget = sortedTargetEvaluations(
    context,
    behavior,
    targets,
    source?.instanceId,
  )[0];
  return bestTarget === undefined
    ? false
    : -Math.min(95, bestTarget.score / 120);
};

export const choosePowerReductionTarget = (
  context: BotDecisionContext,
  behaviors: BotPowerReductionBehaviors,
): BotDecisionChoice | undefined => {
  const decision =
    context.snapshot.players[context.botPlayerId]?.view.pendingDecision;
  if (
    decision === undefined ||
    decision.playerId !== context.botPlayerId ||
    decision.type !== "selectTargets"
  ) {
    return undefined;
  }
  const behavior = sourceBehavior(decision.source?.cardId, behaviors);
  if (behavior === undefined) {
    return undefined;
  }
  if (behavior.target === "currentAttacker") {
    const attacker =
      context.snapshot.players[context.botPlayerId]?.view.battle?.attacker;
    const chosen =
      attacker === undefined
        ? undefined
        : decision.candidates.find(
            (candidate) => candidate.card.instanceId === attacker.instanceId,
          )?.card;
    return chosen === undefined
      ? undefined
      : {
          type: "respondToDecision",
          decisionId: decision.id,
          response: { type: "targets", targets: [chosen] },
        };
  }
  const chosen = sortedTargetEvaluations(
    context,
    behavior,
    decision.candidates.map((candidate) => candidate.card),
    decision.source?.instanceId,
  )[0]?.card;
  if (chosen === undefined) {
    return decision.min === 0
      ? {
          type: "respondToDecision",
          decisionId: decision.id,
          response: { type: "targets", targets: [] },
        }
      : undefined;
  }
  return {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "targets", targets: [chosen] },
  };
};
