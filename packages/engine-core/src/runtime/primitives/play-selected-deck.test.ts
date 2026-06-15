import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardId,
  CardInstance,
  Effect,
  EffectDefinition,
  EngineResult,
  GameState,
  SelectionId,
} from "@optcg/types";

import {
  applyAction,
  createActiveState,
  hashCanonicalStateValue,
  must,
  p1,
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

const playCharacterFromDeckSequence = (): Extract<
  Effect,
  { type: "sequence" }
> => ({
  type: "sequence",
  effects: [
    {
      id: "select-character-from-deck",
      connector: "always",
      saveResultAs: "deckSelection:play",
      effect: {
        type: "selectCards",
        zone: "deck",
        player: "self",
        chooser: "self",
        min: 0,
        max: 1,
        filter: {
          categories: ["character"],
          names: ["Baron Tamago"],
          cost: { op: "lte", value: 4 },
        },
        saveAs: "deckSelection:play" as SelectionId,
        visibility: "chooserOnly",
      },
    },
    {
      id: "play-character-from-deck",
      connector: "ifPreviousSucceeded",
      effect: {
        type: "playSelected",
        selection: "deckSelection:play" as SelectionId,
        ignoreCost: true,
      },
    },
    {
      id: "shuffle-after-deck-play",
      connector: "then",
      effect: { type: "shuffleDeck", player: "self" },
    },
  ],
});

const setupSequenceDefinition = (
  state: GameState,
  source: CardInstance,
  effect: Effect,
): EffectDefinition => {
  const effectDefinitionId = "def-play-selected-deck-sequence";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "play-selected-deck-rules",
      sourceTextHash: "play-selected-deck-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const baseEffect = must(base.effects[0], "base effect");
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...baseEffect,
        id: toEffectId("effect-play-selected-deck-sequence"),
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
  const player = must(state.players[p1], "p1");
  const source = withCardInZone({
    state,
    playerId: p1,
    card: must(player.hand[0], "source"),
    zone: "characterArea",
  });
  player.hand = player.hand.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p1, slot: "hand", index },
  }));
  const definition = setupSequenceDefinition(state, source, effect);
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-play-selected-deck"),
      timingWindowId: toTimingWindowId("window-play-selected-deck"),
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
      causedBy: { type: "ruleProcess", name: "play-selected-deck-test" },
    },
  ];
  return state;
};

const putSupportedCharacterOnTopOfDeck = (state: GameState): CardInstance => {
  const player = must(state.players[p1], "p1");
  const deckFiller: CardInstance = {
    ...player.leader,
    instanceId: "deck-play-selected-filler" as CardInstance["instanceId"],
    cardId: "deck-play-selected-filler" as CardId,
    zone: { zone: "deck", playerId: p1, slot: "deck", index: 1 },
    state: "active",
    attachedDon: [],
  };
  const deckCharacter: CardInstance = {
    ...must(player.deck[0], "deck character"),
    cardId: "deck-baron-tamago" as CardId,
    zone: { zone: "deck", playerId: p1, slot: "deck", index: 0 },
    state: "active",
    attachedDon: [],
  };
  player.deck = [
    deckCharacter,
    deckFiller,
    ...player.deck.slice(1).map((card, index) => ({
      ...card,
      zone: {
        zone: "deck" as const,
        playerId: p1,
        slot: "deck" as const,
        index: index + 2,
      },
    })),
  ];
  state.cardManifest.cards[deckCharacter.cardId] = {
    ...resolvedCard({
      cardId: deckCharacter.cardId,
      category: "character",
      cost: 4,
      power: 3000,
    }),
    name: "Baron Tamago",
  };
  state.cardManifest.cards[deckFiller.cardId] = resolvedCard({
    cardId: deckFiller.cardId,
    category: "character",
    cost: 1,
    power: 1000,
  });
  return deckCharacter;
};

const eventTypes = (result: EngineResult): string[] =>
  result.events.map((event) => event.type);

test("playSelected plays selected Character card from deck and continues to shuffle", () => {
  const state = sequenceQueueState(playCharacterFromDeckSequence());
  const deckCharacter = putSupportedCharacterOnTopOfDeck(state);

  const paused = processEffectRuntime(state);
  const decision = must(paused.state.pendingDecision, "deck selection");
  assert.equal(decision.type, "selectCards");
  assert.equal(decision.playerId, p1);
  assert.equal(decision.visibility.type, "private");
  assert.equal(decision.request.zone, "deck");
  assert.deepEqual(
    decision.candidates.map((candidate) => candidate.card.instanceId),
    [deckCharacter.instanceId],
  );

  const selected = must(decision.candidates[0], "candidate").card;
  const resolved = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "cards", cards: [selected] },
  });
  const played = must(resolved.state.players[p1], "p1").characters.find(
    (card) => card.instanceId === deckCharacter.instanceId,
  );

  assert.equal(resolved.errors, undefined);
  assert.equal(played?.cardId, deckCharacter.cardId);
  assert.deepEqual(eventTypes(resolved), [
    "decisionResolved",
    "cardMoved",
    "cardPlayed",
    "ruleProcessingChecked",
    "deckShuffled",
    "effectResolved",
  ]);
  assert.equal(resolved.state.pendingDecision, undefined);
  assert.equal(resolved.stateHash, hashCanonicalStateValue(resolved.state));
});
