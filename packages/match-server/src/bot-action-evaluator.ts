import type { PlayerView } from "@optcg/types";

import { cardPower, findVisibleCard } from "./bot-context.js";
import type { BotActionContext } from "./bot-types.js";

type BotPendingDecision = NonNullable<PlayerView["pendingDecision"]>;

export interface BotActionEvaluationInput {
  readonly context: BotActionContext;
  readonly pendingDecision?: BotPendingDecision | undefined;
  readonly tacticalScore?: number | undefined;
  readonly profileScore?: number | undefined;
  readonly cardScores: readonly number[];
}

const assumedCounterPowerPerHandCard = 2_000;

const actionPlacementCard = ({
  action,
  relatedCards,
}: Pick<BotActionContext, "action" | "relatedCards">) => {
  const placementId = action.placement?.instanceId;
  return placementId === undefined
    ? undefined
    : relatedCards.find((card) => card.instanceId === placementId);
};

const visibleCardValue = (
  card: BotActionContext["relatedCards"][number] | undefined,
): number => {
  if (card === undefined) {
    return 0;
  }
  const power = cardPower(card) ?? 0;
  const cost = card.currentCost ?? card.printedCost ?? 0;
  const counter = card.printedCounter ?? 0;
  const blockerBonus = card.keywords?.includes("blocker") === true ? 2_000 : 0;
  return power + cost * 1_000 + blockerBonus + counter / 2;
};

const profileAdjustment = (scores: readonly number[]): number => {
  const best = [...scores].sort((left, right) => left - right)[0];
  if (best === undefined) {
    return 0;
  }
  if (best <= 0) {
    return Math.min(140, 70 + Math.abs(best));
  }
  return Math.max(-70, 35 - best);
};

const opponentView = ({
  snapshot,
  botPlayerId,
}: Pick<BotActionContext, "snapshot" | "botPlayerId">):
  | PlayerView["opponent"]
  | undefined => {
  const player = snapshot.players[botPlayerId];
  if (player === undefined || !("opponent" in player.view)) {
    return undefined;
  }
  return player.view.opponent;
};

const attackCardsToStop = (
  attackerPower: number,
  targetPower: number,
): number | undefined =>
  attackerPower < targetPower
    ? undefined
    : Math.ceil(
        (attackerPower - targetPower + 1_000) / assumedCounterPowerPerHandCard,
      );

const hasRemainingAttackForAttachment = ({
  action,
  snapshot,
  botPlayerId,
}: BotActionContext): boolean => {
  const targetId = action.attachment?.targetInstanceId;
  if (action.type !== "attachDon" || targetId === undefined) {
    return true;
  }
  return (snapshot.players[botPlayerId]?.actions ?? []).some(
    (candidate) =>
      candidate.type === "declareAttack" &&
      candidate.attack?.attackerInstanceId === targetId,
  );
};

const actionIsLegalForEvaluation = ({
  context,
}: Pick<BotActionEvaluationInput, "context">): boolean => {
  const { action, snapshot, botPlayerId } = context;
  if (action.type === "concede") {
    return false;
  }
  if (action.type === "attachDon") {
    return hasRemainingAttackForAttachment(context);
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

const decisionUtility = ({
  context,
  pendingDecision,
}: BotActionEvaluationInput): number | undefined => {
  const { action } = context;
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

const tacticalUtility = ({
  context,
  tacticalScore,
}: BotActionEvaluationInput): number | undefined => {
  if (tacticalScore === undefined) {
    return undefined;
  }
  if (tacticalScore < 0) {
    return 2_000 + Math.abs(tacticalScore);
  }
  if (context.action.type === "useCounter") {
    return 650 - tacticalScore;
  }
  return undefined;
};

const characterAttackUtility = (
  context: BotActionContext,
): number | undefined => {
  const targetId = context.action.attack?.targetInstanceId;
  const opponent = opponentView(context);
  if (
    context.action.type !== "declareAttack" ||
    targetId === undefined ||
    opponent === undefined ||
    !opponent.characters.some((card) => card.instanceId === targetId)
  ) {
    return undefined;
  }
  const target = findVisibleCard(
    context.snapshot,
    context.botPlayerId,
    targetId,
  );
  if (target === undefined) {
    return undefined;
  }
  return 75 + Math.min(55, visibleCardValue(target) / 400);
};

const leaderAttackUtility = (context: BotActionContext): number | undefined => {
  const attack = context.action.attack;
  const opponent = opponentView(context);
  if (
    context.action.type !== "declareAttack" ||
    attack === undefined ||
    opponent === undefined ||
    attack.targetInstanceId !== opponent.leader.instanceId
  ) {
    return undefined;
  }
  const attackerPower = cardPower(
    findVisibleCard(
      context.snapshot,
      context.botPlayerId,
      attack.attackerInstanceId,
    ),
  );
  const targetPower = cardPower(opponent.leader);
  if (attackerPower === undefined || targetPower === undefined) {
    return undefined;
  }
  const cardsToStop = attackCardsToStop(attackerPower, targetPower);
  if (cardsToStop === undefined) {
    return undefined;
  }
  const opponentHandCount =
    opponent.hand === undefined ? opponent.handCount : opponent.hand.length;
  const handPressure = cardsToStop * 12;
  const lifePressure = Math.max(0, 5 - opponent.life.count) * 8;
  const lowHandPressure =
    opponent.life.count <= 1 && opponentHandCount < cardsToStop ? 20 : 0;
  return 30 + handPressure + lifePressure + lowHandPressure;
};

const attackUtility = (context: BotActionContext): number | undefined =>
  characterAttackUtility(context) ?? leaderAttackUtility(context);

const attachDonUtility = (context: BotActionContext): number | undefined => {
  const attachment = context.action.attachment;
  const opponent = opponentView(context);
  if (
    context.action.type !== "attachDon" ||
    attachment === undefined ||
    opponent === undefined
  ) {
    return undefined;
  }
  const target = findVisibleCard(
    context.snapshot,
    context.botPlayerId,
    attachment.targetInstanceId,
  );
  const targetPower = cardPower(target);
  const leaderPower = cardPower(opponent.leader);
  if (targetPower === undefined || leaderPower === undefined) {
    return undefined;
  }
  const currentCardsToStop = attackCardsToStop(targetPower, leaderPower);
  const boostedCardsToStop = attackCardsToStop(
    targetPower + 1_000,
    leaderPower,
  );
  if (boostedCardsToStop === undefined) {
    return 20;
  }
  if (currentCardsToStop === undefined) {
    return 95;
  }
  if (boostedCardsToStop > currentCardsToStop) {
    return 75 + boostedCardsToStop * 8;
  }
  return 45;
};

const playCardUtility = ({
  context,
  profileScore,
  cardScores,
}: BotActionEvaluationInput): number | undefined => {
  if (context.action.type !== "playCard") {
    return undefined;
  }
  const card = actionPlacementCard(context);
  const counter = card?.printedCounter ?? 0;
  const counterReservePenalty =
    counter >= 2_000 ? 45 : counter >= 1_000 ? 14 : 0;
  const developmentValue = 25 + Math.min(55, visibleCardValue(card) / 400);
  return (
    developmentValue -
    counterReservePenalty +
    profileAdjustment([
      ...(profileScore === undefined ? [] : [profileScore]),
      ...cardScores,
    ])
  );
};

const activeEffectUtility = ({
  context,
  profileScore,
  cardScores,
}: BotActionEvaluationInput): number | undefined =>
  context.action.type === "activateEffect"
    ? 60 +
      profileAdjustment([
        ...(profileScore === undefined ? [] : [profileScore]),
        ...cardScores,
      ])
    : undefined;

const fallbackUtility = ({ context }: BotActionEvaluationInput): number => {
  switch (context.action.type) {
    case "advanceToMainPhase":
      return 80;
    case "endMainPhase":
      return -100;
    case "useCounter":
      return 20;
    case "activateBlocker":
      return 25;
    case "attachDon":
      return 35;
    case "playCard":
      return 30;
    case "activateEffect":
      return 60;
    case "declareAttack":
      return 40;
    case "respondToDecision":
      return 150;
    case "concede":
      return -10_000;
    default:
      return 0;
  }
};

export const evaluateBotAction = (
  input: BotActionEvaluationInput,
): number | undefined => {
  if (!actionIsLegalForEvaluation(input)) {
    return undefined;
  }
  return (
    decisionUtility(input) ??
    tacticalUtility(input) ??
    attackUtility(input.context) ??
    attachDonUtility(input.context) ??
    playCardUtility(input) ??
    activeEffectUtility(input) ??
    fallbackUtility(input)
  );
};
