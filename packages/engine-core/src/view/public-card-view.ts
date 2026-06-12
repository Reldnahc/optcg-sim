import type {
  CardInstance,
  ComputedGameView,
  GameState,
  InstanceId,
  Keyword,
  PlayerState,
  PublicCardView,
} from "@optcg/types";

import { computeView } from "./compute-view.js";

export interface ComputedBoardCardStats {
  currentPower?: number;
  currentCost?: number;
  keywords?: readonly Keyword[];
  restrictions?: readonly string[];
}

export const toPublicCardView = (card: CardInstance): PublicCardView => ({
  instanceId: card.instanceId,
  cardId: card.cardId,
  owner: card.owner,
  controller: card.controller,
  zone: card.zone,
  attachedDonCount: card.attachedDon.length,
  attachedDonIds: [...card.attachedDon],
  ...(card.state === undefined ? {} : { state: card.state }),
  ...(card.turnPlayed === undefined ? {} : { turnPlayed: card.turnPlayed }),
});

export const toBoardPublicCardView = (
  card: CardInstance,
  state: GameState,
  computedStatsByInstance:
    | ReadonlyMap<InstanceId, ComputedBoardCardStats>
    | undefined,
): PublicCardView => {
  const computedStats = computedStatsByInstance?.get(card.instanceId);
  const metadata = state.cardManifest.cards[card.cardId];
  const printedPower = metadata?.power;
  const printedCost = metadata?.cost;
  return {
    ...toPublicCardView(card),
    ...(printedPower === undefined ? {} : { printedPower }),
    ...(computedStats?.currentPower === undefined
      ? {}
      : { currentPower: computedStats.currentPower }),
    ...(printedCost === undefined ? {} : { printedCost }),
    ...(computedStats?.currentCost === undefined
      ? {}
      : { currentCost: computedStats.currentCost }),
    ...(computedStats?.keywords === undefined ||
    computedStats.keywords.length === 0
      ? {}
      : { keywords: [...computedStats.keywords] }),
    ...(computedStats?.restrictions === undefined ||
    computedStats.restrictions.length === 0
      ? {}
      : { restrictions: [...computedStats.restrictions] }),
  };
};

export const toPublicLifeView = (
  player: PlayerState,
  options: { readonly revealAll?: boolean } = {},
) => ({
  count: player.life.length,
  faceUpCards: player.life
    .filter((lifeCard) => options.revealAll === true || lifeCard.faceUp)
    .map((lifeCard) => toPublicCardView(lifeCard.card)),
});

const boardCardsForState = (state: GameState): CardInstance[] =>
  Object.values(state.players).flatMap((player) => [
    player.leader,
    ...player.characters,
  ]);

const hasComputableBoardPowerMetadata = (state: GameState): boolean => {
  return boardCardsForState(state).every((card) => {
    const resolved = state.cardManifest.cards[card.cardId];
    if (resolved === undefined) return false;
    if (resolved.category !== "leader" && resolved.category !== "character") {
      return false;
    }
    if (resolved.power === undefined) return false;
    return true;
  });
};

export const computedBoardCardStatsByInstance = (
  state: GameState,
): ReadonlyMap<InstanceId, ComputedBoardCardStats> | undefined => {
  if (!hasComputableBoardPowerMetadata(state)) {
    return undefined;
  }
  let view: ComputedGameView;
  try {
    view = computeView(state, {
      supportStatusPolicy: "ignore",
      unsupportedCombatKeywordPolicy: "ignore",
    });
  } catch (error) {
    if (error instanceof TypeError) {
      return undefined;
    }
    throw error;
  }
  return new Map<InstanceId, ComputedBoardCardStats>(
    Object.values(view.cards).map((card) => [
      card.instanceId,
      {
        ...(card.currentPower === undefined
          ? {}
          : { currentPower: card.currentPower }),
        ...(card.currentCost === undefined
          ? {}
          : { currentCost: card.currentCost }),
        ...(card.keywords.length === 0 ? {} : { keywords: card.keywords }),
        ...(card.restrictions.length === 0
          ? {}
          : { restrictions: card.restrictions }),
      },
    ]),
  );
};
