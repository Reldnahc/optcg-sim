import type {
  CardInstance,
  CardRef,
  CardSnapshot,
  GameState,
  PlayerId,
} from "@optcg/types";

import type { SelectedTargetKoReplacementCandidate } from "../primitives.js";
import type { LocatedReplacementSource } from "./types.js";

const findReplacementSource = (
  state: GameState,
  source: CardRef,
): LocatedReplacementSource | null => {
  for (const [, player] of Object.entries(state.players) as [
    CardInstance["controller"],
    GameState["players"][CardInstance["controller"]],
  ][]) {
    const card = [
      player.leader,
      ...player.characters,
      ...(player.stage === undefined ? [] : [player.stage]),
      ...player.hand,
      ...player.deck,
      ...player.trash,
      ...player.costArea,
      ...player.donDeck,
      ...player.life.map((lifeCard) => lifeCard.card),
    ].find((candidate) => candidate.instanceId === source.instanceId);
    if (card !== undefined) {
      return { card };
    }
  }
  return null;
};

export const toReplacementDrawSourceSnapshot = (
  state: GameState,
  source: CardRef,
): CardSnapshot | null => {
  const located = findReplacementSource(state, source);
  const resolved = state.cardManifest.cards[source.cardId];
  if (located === null || resolved === undefined) {
    return null;
  }
  return {
    instanceId: located.card.instanceId,
    cardId: located.card.cardId,
    ownerId: located.card.owner,
    controllerId: located.card.controller,
    zone: located.card.zone,
    category: resolved.category,
    colors: [...resolved.colors],
    ...(resolved.cost === undefined ? {} : { cost: resolved.cost }),
    ...(resolved.power === undefined ? {} : { power: resolved.power }),
    ...(resolved.counter === undefined ? {} : { counter: resolved.counter }),
    ...(resolved.life === undefined ? {} : { life: resolved.life }),
    keywords: [...resolved.printedKeywords],
  };
};

export const replacementInsteadTransformedPayload = (
  candidate: SelectedTargetKoReplacementCandidate,
) => ({
  controllerId: candidate.controllerId,
  effect: candidate.replacementEffect.instead,
  replacementId: candidate.id,
  source: candidate.source,
});

export const currentPublicFieldRefForInstance = (
  state: GameState,
  source: CardRef,
): CardRef | undefined => {
  for (const [playerId, player] of Object.entries(state.players) as [
    PlayerId,
    GameState["players"][PlayerId],
  ][]) {
    if (player.leader.instanceId === source.instanceId) {
      return {
        instanceId: player.leader.instanceId,
        cardId: player.leader.cardId,
        playerId,
        zone: player.leader.zone,
      };
    }
    const character = player.characters.find(
      (card) => card.instanceId === source.instanceId,
    );
    if (character !== undefined) {
      return {
        instanceId: character.instanceId,
        cardId: character.cardId,
        playerId,
        zone: character.zone,
      };
    }
    if (player.stage?.instanceId === source.instanceId) {
      return {
        instanceId: player.stage.instanceId,
        cardId: player.stage.cardId,
        playerId,
        zone: player.stage.zone,
      };
    }
  }
  return undefined;
};
