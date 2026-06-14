import type {
  CardInstance,
  CardRef,
  GameState,
  ResolvedCard,
} from "@optcg/types";

import { zonesEqual } from "../actions/state.js";
import { isCardEffectInvalidated } from "../effect-invalidation.js";

export type LiveFieldSource = {
  readonly card: CardInstance;
  readonly resolved: ResolvedCard;
};

const isFieldSourceZone = (
  zone: CardRef["zone"],
): zone is NonNullable<CardRef["zone"]> =>
  zone?.zone === "leaderArea" ||
  zone?.zone === "characterArea" ||
  zone?.zone === "stageArea";

const fieldCardsForPlayer = (
  state: GameState,
  playerId: CardRef["playerId"],
): readonly CardInstance[] => {
  const player = state.players[playerId];
  if (player === undefined) {
    return [];
  }
  return [
    player.leader,
    ...player.characters,
    ...(player.stage === undefined ? [] : [player.stage]),
  ];
};

export const findFieldSource = (
  state: GameState,
  source: CardRef,
): LiveFieldSource | undefined => {
  if (!isFieldSourceZone(source.zone)) {
    return undefined;
  }
  const card = fieldCardsForPlayer(state, source.playerId).find(
    (candidate) =>
      candidate.instanceId === source.instanceId &&
      candidate.cardId === source.cardId &&
      zonesEqual(candidate.zone, source.zone),
  );
  if (card === undefined) {
    return undefined;
  }
  const resolved = state.cardManifest.cards[card.cardId];
  return resolved === undefined ? undefined : { card, resolved };
};

export const fieldSourceStillPresent = (
  state: GameState,
  source: CardRef,
): boolean => findFieldSource(state, source) !== undefined;

export const fieldSourceCanUseEffects = (
  state: GameState,
  source: CardRef,
): LiveFieldSource | undefined => {
  const live = findFieldSource(state, source);
  if (live === undefined || isCardEffectInvalidated(state, live.card)) {
    return undefined;
  }
  return live;
};
