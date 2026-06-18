import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardId,
  CardInstance,
  Effect,
  EffectDefinition,
  GameState,
  SelectionId,
} from "@optcg/types";

import {
  applyAction,
  createActiveState,
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

const reindexHand = (cards: readonly CardInstance[]): CardInstance[] =>
  cards.map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p1, slot: "hand", index },
  }));

const moveCharacterFromTrashToLifeSequence = (): Extract<
  Effect,
  { type: "sequence" }
> => ({
  type: "sequence",
  effects: [
    {
      id: "select-character-from-trash-to-life",
      connector: "always",
      saveResultAs: "trashSelection:addToLife",
      effect: {
        type: "selectCards",
        zone: "trash",
        player: "self",
        chooser: "self",
        min: 0,
        max: 1,
        filter: {
          categories: ["character"],
        },
        saveAs: "trashSelection:addToLife" as SelectionId,
        visibility: "bothPlayers",
      },
    },
    {
      id: "move-character-from-trash-to-life",
      connector: "ifPossible",
      effect: {
        type: "moveSelected",
        selection: "trashSelection:addToLife" as SelectionId,
        from: "trash",
        to: "life",
        position: "bottom",
      },
    },
  ],
});

const moveCharacterFromHandOrTrashToLifeSequence = (): Extract<
  Effect,
  { type: "sequence" }
> => ({
  type: "sequence",
  effects: [
    {
      id: "select-character-from-hand-or-trash-to-life",
      connector: "always",
      saveResultAs: "cardSelection:self-hand-or-trash-to-life-placement",
      effect: {
        type: "selectCards",
        zones: ["hand", "trash"],
        player: "self",
        chooser: "self",
        min: 0,
        max: 2,
        filter: {
          categories: ["character"],
          cost: { op: "eq", value: 5 },
        },
        saveAs:
          "cardSelection:self-hand-or-trash-to-life-placement" as SelectionId,
        visibility: "chooserOnly",
      },
    },
    {
      id: "move-character-from-current-zone-to-life",
      connector: "ifPossible",
      effect: {
        type: "moveSelected",
        selection:
          "cardSelection:self-hand-or-trash-to-life-placement" as SelectionId,
        from: "currentZone",
        to: "life",
        position: "top",
        destinationFaceUp: true,
      },
    },
  ],
});

const setupSequenceDefinition = (
  state: GameState,
  source: CardInstance,
  effect: Effect,
): EffectDefinition => {
  const effectDefinitionId = "def-selected-trash-to-life-sequence";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "selected-trash-to-life-rules",
      sourceTextHash: "selected-trash-to-life-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const baseEffect = must(base.effects[0], "base effect");
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...baseEffect,
        id: toEffectId("effect-selected-trash-to-life-sequence"),
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
  p1State.hand = reindexHand(p1State.hand.slice(1));
  const definition = setupSequenceDefinition(state, source, effect);
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-selected-trash-to-life"),
      timingWindowId: toTimingWindowId("window-selected-trash-to-life"),
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
      causedBy: { type: "ruleProcess", name: "selected-trash-to-life-test" },
    },
  ];
  return state;
};

const moveSupportedCharacterToTrash = (state: GameState): CardInstance => {
  const player = must(state.players[p1], "p1");
  const card = must(player.hand[0], "character source");
  const trashCharacter: CardInstance = {
    ...card,
    cardId: "trash-character-selected-life" as CardId,
    zone: { zone: "trash", playerId: p1, slot: "trash", index: 0 },
    state: "active",
    attachedDon: [],
  };
  player.hand = reindexHand(player.hand.slice(1));
  player.trash = [trashCharacter, ...player.trash];
  state.cardManifest.cards[trashCharacter.cardId] = resolvedCard({
    cardId: trashCharacter.cardId,
    category: "character",
    cost: 1,
    power: 1000,
  });
  return trashCharacter;
};

test("trash-origin moveSelected adds selected card to bottom of Life face-down", () => {
  const state = sequenceQueueState(moveCharacterFromTrashToLifeSequence());
  const trashCharacter = moveSupportedCharacterToTrash(state);
  const initialLife = [
    ...must(state.players[p1], "p1").life.map(
      (lifeCard) => lifeCard.card.instanceId,
    ),
  ];

  const paused = processEffectRuntime(state);
  const selection = must(paused.state.pendingDecision, "selection");
  assert.equal(selection.type, "selectCards");
  const selected = must(selection.candidates[0], "candidate").card;
  const resolved = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: selection.id,
    response: { type: "cards", cards: [selected] },
  });
  const player = must(resolved.state.players[p1], "p1");
  const addedLife = must(player.life.at(-1), "added life");

  assert.equal(resolved.errors, undefined);
  assert.deepEqual(
    player.life
      .slice(0, initialLife.length)
      .map((lifeCard) => lifeCard.card.instanceId),
    initialLife,
  );
  assert.equal(addedLife.card.instanceId, trashCharacter.instanceId);
  assert.equal(addedLife.faceUp, false);
  assert.equal(
    player.trash.some((card) => card.instanceId === trashCharacter.instanceId),
    false,
  );
});

test("current-zone moveSelected adds selected hand and trash cards to top of Life face-up", () => {
  const state = sequenceQueueState(
    moveCharacterFromHandOrTrashToLifeSequence(),
  );
  const player = must(state.players[p1], "p1");
  const handCharacter: CardInstance = {
    ...must(player.hand[0], "hand character"),
    cardId: "hand-character-selected-life" as CardId,
    zone: { zone: "hand", playerId: p1, slot: "hand", index: 0 },
    state: "active",
    attachedDon: [],
  };
  const trashCharacter: CardInstance = {
    ...must(player.hand[1], "trash character"),
    cardId: "trash-character-selected-current-life" as CardId,
    zone: { zone: "trash", playerId: p1, slot: "trash", index: 0 },
    state: "active",
    attachedDon: [],
  };
  player.hand = reindexHand([handCharacter, ...player.hand.slice(2)]);
  player.trash = [trashCharacter, ...player.trash];
  state.cardManifest.cards[handCharacter.cardId] = resolvedCard({
    cardId: handCharacter.cardId,
    category: "character",
    cost: 5,
    power: 5000,
  });
  state.cardManifest.cards[trashCharacter.cardId] = resolvedCard({
    cardId: trashCharacter.cardId,
    category: "character",
    cost: 5,
    power: 5000,
  });
  const initialLife = [
    ...player.life.map((lifeCard) => lifeCard.card.instanceId),
  ];

  const paused = processEffectRuntime(state);
  const selection = must(paused.state.pendingDecision, "selection");
  assert.equal(paused.errors, undefined);
  assert.equal(selection.type, "selectCards");
  assert.deepEqual(selection.request.zones, ["hand", "trash"]);
  const selectedCards = selection.candidates.map((candidate) => candidate.card);
  const resolved = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: selection.id,
    response: { type: "cards", cards: selectedCards },
  });
  const resolvedPlayer = must(resolved.state.players[p1], "resolved p1");

  assert.equal(resolved.errors, undefined);
  assert.deepEqual(
    resolvedPlayer.life.slice(0, 2).map((lifeCard) => lifeCard.card.instanceId),
    [handCharacter.instanceId, trashCharacter.instanceId],
  );
  assert.deepEqual(
    resolvedPlayer.life.slice(2).map((lifeCard) => lifeCard.card.instanceId),
    initialLife,
  );
  assert.equal(resolvedPlayer.life[0]?.faceUp, true);
  assert.equal(resolvedPlayer.life[1]?.faceUp, true);
  assert.equal(
    resolvedPlayer.hand.some(
      (card) => card.instanceId === handCharacter.instanceId,
    ),
    false,
  );
  assert.equal(
    resolvedPlayer.trash.some(
      (card) => card.instanceId === trashCharacter.instanceId,
    ),
    false,
  );
});
