import type { CardInstance, LegalAction, PlayerId } from "@optcg/types";

import {
  createActiveState,
  must,
  p1,
  p2,
  resolvedCard,
} from "../action-test-fixtures.js";

export const hasPlayCardAction = (
  legal: readonly LegalAction[],
  card: CardInstance,
): boolean =>
  legal.some(
    (action) =>
      action.type === "playCard" && action.cardInstanceId === card.instanceId,
  );

export const toTestCardRef = (card: CardInstance, playerId: PlayerId) => ({
  instanceId: card.instanceId,
  cardId: card.cardId,
  playerId,
  zone: card.zone,
});

export const respondToDecisionActions = (
  legal: readonly LegalAction[],
): Extract<LegalAction, { type: "respondToDecision" }>[] =>
  legal.filter((action) => action.type === "respondToDecision");

export const setupMainPlayState = () => {
  const state = createActiveState();
  state.turn.phase = "main";
  state.turn.turnPlayerId = p1;
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  p1State.costArea = p1State.donDeck.slice(0, 3).map((card, index) => ({
    ...card,
    zone: { zone: "costArea", playerId: p1, slot: "cost", index },
    state: "active",
  }));
  p1State.donDeck = p1State.donDeck.slice(3).map((card, index) => ({
    ...card,
    zone: { zone: "donDeck", playerId: p1, slot: "donDeck", index },
  }));
  p2State.costArea = p2State.donDeck.slice(0, 3).map((card, index) => ({
    ...card,
    zone: { zone: "costArea", playerId: p2, slot: "cost", index },
    state: "active",
  }));
  p2State.donDeck = p2State.donDeck.slice(3).map((card, index) => ({
    ...card,
    zone: { zone: "donDeck", playerId: p2, slot: "donDeck", index },
  }));
  return state;
};

export const setupOccupiedStagePlayState = (cost: number) => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const newStage = must(p1State.hand[1], "new stage");
  const oldStageSource = must(p1State.hand[2], "old stage source");
  p1State.stage = {
    ...oldStageSource,
    instanceId:
      `${String(oldStageSource.instanceId)}:existing-stage` as CardInstance["instanceId"],
    zone: { zone: "stageArea", playerId: p1, slot: "stage", index: 0 },
    state: "active",
    attachedDon: [],
  };
  state.cardManifest.cards[newStage.cardId] = resolvedCard({
    cardId: newStage.cardId,
    category: "stage",
    cost,
  });
  state.cardManifest.cards[p1State.stage.cardId] = resolvedCard({
    cardId: p1State.stage.cardId,
    category: "stage",
    cost: 0,
  });
  return { state, newStage, oldStage: p1State.stage };
};

export const setupFullCharacterPlayState = (cost: number) => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const newCharacter = must(p1State.hand[0], "new character");
  p1State.characters = Array.from({ length: 5 }, (_, index) => {
    const source = must(p1State.hand[(index % 4) + 1], "character source");
    const character: CardInstance = {
      ...source,
      instanceId:
        `${String(source.instanceId)}:existing-character:${String(index)}` as CardInstance["instanceId"],
      zone: { zone: "characterArea", playerId: p1, slot: "character", index },
      state: "active",
      attachedDon: [],
      turnPlayed: 1,
    };
    state.cardManifest.cards[character.cardId] = resolvedCard({
      cardId: character.cardId,
      category: "character",
      cost: 0,
      power: 2000,
    });
    return character;
  });
  state.cardManifest.cards[newCharacter.cardId] = resolvedCard({
    cardId: newCharacter.cardId,
    category: "character",
    cost,
    power: 3000,
  });
  return { state, newCharacter, existingCharacters: p1State.characters };
};
