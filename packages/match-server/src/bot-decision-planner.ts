import type { CardRef, PlayerView } from "@optcg/types";

import { findVisibleCard, visibleCardValue } from "./bot-features.js";
import type { BotDecisionChoice, BotDecisionContext } from "./bot-types.js";

type BotPendingDecision = NonNullable<PlayerView["pendingDecision"]>;

const cardDecisionValue = (
  context: BotDecisionContext,
  card: CardRef,
): number =>
  visibleCardValue(
    findVisibleCard(context.snapshot, context.botPlayerId, card.instanceId),
    { includeCounter: true },
  );

const selectableChoices = (
  decision: Extract<BotPendingDecision, { type: "selectCards" }>,
): readonly CardRef[] =>
  decision.choices
    .filter((choice) => choice.selectable)
    .map((choice) => choice.card);

const targetChoices = (
  decision: Extract<BotPendingDecision, { type: "selectTargets" }>,
): readonly CardRef[] => decision.candidates.map((choice) => choice.card);

const selectedCardCount = (
  decision: Extract<BotPendingDecision, { type: "selectCards" }>,
): number =>
  Math.min(
    decision.max,
    Math.max(decision.min, 1),
    selectableChoices(decision).length,
  );

const selectedTargetCount = (
  decision: Extract<BotPendingDecision, { type: "selectTargets" }>,
): number =>
  Math.min(decision.max, decision.min, targetChoices(decision).length);

const chooseHighestValueCards = (
  context: BotDecisionContext,
  decision: Extract<BotPendingDecision, { type: "selectCards" }>,
): readonly CardRef[] =>
  selectableChoices(decision)
    .map((card) => ({
      card,
      value: cardDecisionValue(context, card),
    }))
    .sort((left, right) => right.value - left.value)
    .slice(0, selectedCardCount(decision))
    .map((choice) => choice.card);

const chooseHighestValueTargets = (
  context: BotDecisionContext,
  decision: Extract<BotPendingDecision, { type: "selectTargets" }>,
): readonly CardRef[] =>
  targetChoices(decision)
    .map((card) => ({
      card,
      value: cardDecisionValue(context, card),
    }))
    .sort((left, right) => right.value - left.value)
    .slice(0, selectedTargetCount(decision))
    .map((choice) => choice.card);

const chooseLowestValueCards = (
  context: BotDecisionContext,
  decision: Extract<BotPendingDecision, { type: "selectCards" }>,
): readonly CardRef[] =>
  selectableChoices(decision)
    .map((card) => ({
      card,
      value: cardDecisionValue(context, card),
    }))
    .sort((left, right) => left.value - right.value)
    .slice(0, selectedCardCount(decision))
    .map((choice) => choice.card);

const decisionLooksLikePayment = (decision: BotPendingDecision): boolean =>
  decision.type === "payCost" ||
  decision.causedBy.type === "effect" ||
  /cost|trash|discard|pay/iu.test(decision.prompt);

const decisionLooksLikeBattleDecision = (
  decision: BotPendingDecision,
): boolean =>
  decision.causedBy.type === "ruleProcess" &&
  /block|counter|battle/iu.test(
    `${decision.causedBy.name}\n${decision.prompt}`,
  );

export const chooseGenericBotDecision = (
  context: BotDecisionContext,
): BotDecisionChoice | undefined => {
  const decision =
    context.snapshot.players[context.botPlayerId]?.view.pendingDecision;
  if (decision === undefined || decision.playerId !== context.botPlayerId) {
    return undefined;
  }
  if (decisionLooksLikeBattleDecision(decision)) {
    return undefined;
  }
  if (decision.type === "selectCards") {
    const cards = decisionLooksLikePayment(decision)
      ? chooseLowestValueCards(context, decision)
      : chooseHighestValueCards(context, decision);
    if (cards.length === 0) {
      return undefined;
    }
    return {
      type: "respondToDecision",
      decisionId: decision.id,
      response: { type: "cards", cards: [...cards] },
    };
  }
  if (decision.type === "selectTargets") {
    const targets = chooseHighestValueTargets(context, decision);
    if (targets.length < decision.min) {
      return undefined;
    }
    return {
      type: "respondToDecision",
      decisionId: decision.id,
      response: { type: "targets", targets: [...targets] },
    };
  }
  return undefined;
};
