import type { CardRef, PlayerView, PublicCardView } from "@optcg/types";

import { cardPower, findVisibleCard } from "./bot-context.js";
import type { BotDecisionChoice, BotDecisionContext } from "./bot-types.js";

type SelectCardsDecision = Extract<
  NonNullable<PlayerView["pendingDecision"]>,
  { type: "selectCards" }
>;

export interface CharacterOverflowOptions {
  readonly preserveCardIds?: ReadonlySet<string>;
}

export const isCharacterOverflowDecision = (
  decision: SelectCardsDecision,
): boolean =>
  String(decision.id).startsWith("decision:character-overflow:") ||
  String(decision.id).startsWith("decision:play-selected-overflow:") ||
  String(decision.id).startsWith("decision:play-source-overflow:");

export const selectableCardsForDecision = (
  decision: SelectCardsDecision,
): SelectCardsDecision["candidates"][number]["card"][] => {
  if (decision.choices.length > 0) {
    return decision.choices
      .filter((choice) => choice.selectable)
      .map((choice) => choice.card);
  }
  return decision.candidates.map((candidate) => candidate.card);
};

const visibleCardValue = (card: PublicCardView | undefined): number => {
  if (card === undefined) {
    return 0;
  }
  const power = cardPower(card) ?? 0;
  const cost = card.currentCost ?? card.printedCost ?? 0;
  const counter = card.printedCounter ?? 0;
  const attachedDonPenalty = card.attachedDonCount * 1_000;
  return power + cost * 1_000 + counter / 2 + attachedDonPenalty;
};

const overflowTrashScore = (
  context: BotDecisionContext,
  card: CardRef,
  options: CharacterOverflowOptions,
): number => {
  const view = context.snapshot.players[context.botPlayerId]?.view;
  const resolved =
    view !== undefined && "self" in view
      ? findVisibleCard(context.snapshot, context.botPlayerId, card.instanceId)
      : undefined;
  const preservePenalty =
    options.preserveCardIds?.has(String(card.cardId)) === true ? 100_000 : 0;
  return visibleCardValue(resolved) + preservePenalty;
};

export const chooseCharacterOverflowDecision = (
  context: BotDecisionContext,
  options: CharacterOverflowOptions = {},
): BotDecisionChoice | undefined => {
  const decision =
    context.snapshot.players[context.botPlayerId]?.view.pendingDecision;
  if (
    decision === undefined ||
    decision.playerId !== context.botPlayerId ||
    decision.type !== "selectCards" ||
    !isCharacterOverflowDecision(decision)
  ) {
    return undefined;
  }
  const chosen = selectableCardsForDecision(decision).sort(
    (left, right) =>
      overflowTrashScore(context, left, options) -
      overflowTrashScore(context, right, options),
  )[0];
  if (chosen === undefined) {
    return undefined;
  }
  return {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "cards", cards: [chosen] },
  };
};
