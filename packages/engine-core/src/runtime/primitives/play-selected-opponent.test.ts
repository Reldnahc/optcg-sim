import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardInstance,
  Effect,
  EffectDefinition,
  GameState,
  HandSelectionId,
} from "@optcg/types";

import {
  applyAction,
  createActiveState,
  hashCanonicalStateValue,
  must,
  p1,
  p2,
  processEffectRuntime,
  queueDrawForP1,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
  toEffectId,
  toQueueEntryId,
  toSourceSnapshot,
  toTimingWindowId,
  withCardInZone,
} from "../../effect-runtime-queue/test-support.js";

const opponentPlaySelectedSequence = (): Extract<
  Effect,
  { type: "sequence" }
> => ({
  type: "sequence",
  effects: [
    {
      id: "select-opponent-character-from-hand",
      connector: "always",
      effect: {
        type: "selectCards",
        zone: "hand",
        player: "opponent",
        chooser: "opponent",
        min: 0,
        max: 1,
        filter: { categories: ["character"] },
        saveAs: "handSelection:opponent-play" as HandSelectionId,
        visibility: "chooserOnly",
      },
    },
    {
      id: "play-opponent-selected",
      connector: "ifPreviousSucceeded",
      effect: {
        type: "playSelected",
        selection: "handSelection:opponent-play" as HandSelectionId,
        player: "opponent",
        enterRested: true,
        ignoreCost: true,
      },
    },
  ],
});

const reindexHand = (
  cards: readonly CardInstance[],
  playerId: typeof p1,
): CardInstance[] =>
  cards.map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId, slot: "hand", index },
  }));

const setupSequenceDefinition = (
  state: GameState,
  source: CardInstance,
  effect: Effect,
): EffectDefinition => {
  const effectDefinitionId = "def-opponent-play-selected-sequence";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "opponent-play-selected-rules",
      sourceTextHash: "opponent-play-selected-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const baseEffect = must(base.effects[0], "base effect");
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...baseEffect,
        id: toEffectId("effect-opponent-play-selected-sequence"),
        effect,
      },
    ],
  };
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = { [effectDefinitionId]: definition };
  state.cardManifest.cards[source.cardId] = supportCard;
  return definition;
};

const sequenceQueueState = (effect: Effect): GameState => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  const p1State = must(state.players[p1], "p1");
  const source = withCardInZone({
    state,
    playerId: p1,
    card: must(p1State.hand[0], "source"),
    zone: "characterArea",
  });
  p1State.hand = reindexHand(p1State.hand.slice(1), p1);
  const definition = setupSequenceDefinition(state, source, effect);
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-opponent-play-selected"),
      timingWindowId: toTimingWindowId("window-opponent-play-selected"),
      controllerId: p1,
      source: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: p1,
        zone: source.zone,
      },
      sourceSnapshot: toSourceSnapshot(source, p1, p1),
      effectBlockId: must(definition.effects[0], "sequence effect").id,
      sourcePresencePolicy: "mustRemainInSameZone",
      causedBy: { type: "ruleProcess", name: "opponent-play-selected-test" },
    },
  ];
  return state;
};

test("opponent hand playSelected lets the opponent choose and play their selected card", () => {
  const state = sequenceQueueState(opponentPlaySelectedSequence());
  const opponent = must(state.players[p2], "p2");
  opponent.hand = opponent.hand.map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p2, slot: "hand", index },
  }));
  for (const card of opponent.hand) {
    state.cardManifest.cards[card.cardId] = resolvedCard({
      cardId: card.cardId,
      category: "character",
      cost: 1,
      power: 1000,
    });
  }

  const paused = processEffectRuntime(state);
  const decision = must(paused.state.pendingDecision, "opponent selection");
  assert.equal(decision.type, "selectCards");
  assert.equal(decision.playerId, p2);
  const selected = must(decision.candidates[0], "candidate").card;
  const resolved = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "cards", cards: [selected] },
  });
  const played = must(resolved.state.players[p2], "p2").characters.find(
    (card) => card.instanceId === selected.instanceId,
  );

  assert.equal(resolved.errors, undefined);
  assert.equal(played?.state, "rested");
  assert.equal(resolved.stateHash, hashCanonicalStateValue(resolved.state));
});
