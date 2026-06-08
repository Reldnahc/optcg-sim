import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardInstance,
  Effect,
  EffectDefinition,
  GameState,
} from "@optcg/types";

import {
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
} from "../effect-runtime-queue/test-support.js";

const reindexHand = (
  cards: readonly CardInstance[],
  playerId = p1,
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
  const effectDefinitionId = "def-runner-composition-sequence";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "runner-composition-rules",
      sourceTextHash: "runner-composition-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const baseEffect = must(base.effects[0], "base effect");
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...baseEffect,
        id: toEffectId("effect-runner-composition-sequence"),
        effect,
      },
    ],
  };
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    [effectDefinitionId]: definition,
  };
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
  const remainingHand = p1State.hand.slice(1);
  const secondDrawCard = must(
    remainingHand[remainingHand.length - 1],
    "deck refill",
  );
  p1State.hand = reindexHand(remainingHand.slice(0, -1));
  p1State.deck = [
    ...p1State.deck,
    {
      ...secondDrawCard,
      zone: {
        zone: "deck",
        playerId: p1,
        slot: "deck",
        index: p1State.deck.length,
      },
    },
  ];
  const definition = setupSequenceDefinition(state, source, effect);
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-runner-composition-sequence"),
      timingWindowId: toTimingWindowId("window-runner-composition-sequence"),
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
      causedBy: { type: "ruleProcess", name: "runner-composition-test" },
    },
  ];
  return state;
};

const addP1BlackCharacterToTrash = (state: GameState): void => {
  const p1State = must(state.players[p1], "p1");
  const card = must(p1State.hand[0], "trash card source");
  const trashCard: CardInstance = {
    ...card,
    zone: { zone: "trash", playerId: p1, slot: "trash", index: 0 },
  };
  state.cardManifest.cards[trashCard.cardId] = {
    ...resolvedCard({
      cardId: trashCard.cardId,
      category: "character",
      cost: 3,
      power: 3000,
    }),
    colors: ["black"],
  };
  p1State.trash = [trashCard];
  p1State.hand = reindexHand(
    p1State.hand.filter(
      (candidate) => candidate.instanceId !== card.instanceId,
    ),
  );
};

const rootDraw = (): Extract<Effect, { type: "sequence" }> => ({
  type: "sequence",
  effects: [
    {
      id: "root-draw",
      connector: "always",
      effect: { type: "draw", player: "self", count: 1 },
    },
  ],
});

const nestedDraw = (): Extract<Effect, { type: "sequence" }> => ({
  type: "sequence",
  effects: [
    {
      id: "nested-draw-sequence",
      connector: "always",
      effect: {
        type: "sequence",
        effects: [
          {
            id: "nested-draw",
            connector: "always",
            effect: { type: "draw", player: "self", count: 1 },
          },
        ],
      },
    },
  ],
});

const conditionalDraw = (): Extract<Effect, { type: "sequence" }> => ({
  type: "sequence",
  effects: [
    {
      id: "conditional-draw",
      connector: "always",
      effect: {
        type: "conditional",
        if: { type: "trashCount", player: "self", op: "gte", value: 1 },
        then: {
          type: "sequence",
          effects: [
            {
              id: "conditional-child-draw",
              connector: "always",
              effect: { type: "draw", player: "self", count: 1 },
            },
          ],
        },
      },
    },
  ],
});

test("sequence runner executes draw through root, nested, and conditional composition doors", () => {
  const cases = [
    { effect: rootDraw(), name: "root", withTrash: false },
    { effect: nestedDraw(), name: "nested", withTrash: false },
    { effect: conditionalDraw(), name: "conditional", withTrash: true },
  ] as const;

  for (const testCase of cases) {
    const state = sequenceQueueState(testCase.effect);
    if (testCase.withTrash) {
      addP1BlackCharacterToTrash(state);
    }
    const beforeP1 = must(state.players[p1], `${testCase.name} before p1`);
    const beforeHandCount = beforeP1.hand.length;
    const beforeDeckCount = beforeP1.deck.length;

    const resolved = processEffectRuntime(state);

    assert.equal(resolved.errors, undefined, testCase.name);
    assert.equal(resolved.state.pendingDecision, undefined, testCase.name);
    const afterP1 = must(
      resolved.state.players[p1],
      `${testCase.name} after p1`,
    );
    assert.equal(afterP1.hand.length, beforeHandCount + 1, testCase.name);
    assert.equal(afterP1.deck.length, beforeDeckCount - 1, testCase.name);
    const drawEvents = resolved.events.filter(
      (event) => event.type === "cardDrawn",
    );
    assert.equal(drawEvents.length, 1, testCase.name);
  }
});
