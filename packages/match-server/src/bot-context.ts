import type { InstanceId, PlayerId } from "@optcg/types";

import type {
  DevMatchSnapshot,
  DevVisibleAction,
} from "./dev-snapshot-types.js";
import type { BotVisibleCard } from "./bot-types.js";

export const cardPower = (
  card: BotVisibleCard | undefined,
): number | undefined => card?.currentPower ?? card?.printedPower;

export const visibleCards = (
  snapshot: DevMatchSnapshot,
  playerId: PlayerId,
): readonly BotVisibleCard[] => {
  const view = snapshot.players[playerId]?.view;
  if (view === undefined) {
    return [];
  }
  return [
    view.self.leader,
    ...view.self.hand,
    ...view.self.characters,
    ...view.self.costArea,
    ...(view.self.stage === undefined ? [] : [view.self.stage]),
    view.opponent.leader,
    ...(view.opponent.hand ?? []),
    ...view.opponent.characters,
    ...view.opponent.costArea,
    ...(view.opponent.stage === undefined ? [] : [view.opponent.stage]),
  ];
};

export const findVisibleCard = (
  snapshot: DevMatchSnapshot,
  playerId: PlayerId,
  instanceId: InstanceId,
): BotVisibleCard | undefined =>
  visibleCards(snapshot, playerId).find(
    (card) => card.instanceId === instanceId,
  );

const pushVisibleCard = (
  cards: BotVisibleCard[],
  snapshot: DevMatchSnapshot,
  playerId: PlayerId,
  instanceId: InstanceId,
): void => {
  const card = findVisibleCard(snapshot, playerId, instanceId);
  if (
    card !== undefined &&
    !cards.some((candidate) => candidate.instanceId === card.instanceId)
  ) {
    cards.push(card);
  }
};

export const relatedCardsForAction = (
  snapshot: DevMatchSnapshot,
  playerId: PlayerId,
  action: DevVisibleAction,
): readonly BotVisibleCard[] => {
  const cards: BotVisibleCard[] = [];
  if (action.attack !== undefined) {
    pushVisibleCard(
      cards,
      snapshot,
      playerId,
      action.attack.attackerInstanceId,
    );
    pushVisibleCard(cards, snapshot, playerId, action.attack.targetInstanceId);
  }
  if (action.attachment !== undefined) {
    pushVisibleCard(cards, snapshot, playerId, action.attachment.donInstanceId);
    pushVisibleCard(
      cards,
      snapshot,
      playerId,
      action.attachment.targetInstanceId,
    );
  }
  if (action.counter !== undefined) {
    pushVisibleCard(cards, snapshot, playerId, action.counter.cardInstanceId);
    pushVisibleCard(cards, snapshot, playerId, action.counter.targetInstanceId);
  }
  if (action.placement !== undefined) {
    pushVisibleCard(cards, snapshot, playerId, action.placement.instanceId);
  }
  return cards;
};
