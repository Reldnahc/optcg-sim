import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardInstance,
  Effect,
  EffectDefinition,
  GameState,
} from "@optcg/types";

import {
  applyAction,
  createActiveState,
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

const conditionalElseDraw = (): Extract<Effect, { type: "sequence" }> => ({
  type: "sequence",
  effects: [
    {
      id: "conditional-else-draw",
      connector: "always",
      effect: {
        type: "conditional",
        if: { type: "trashCount", player: "self", op: "gte", value: 99 },
        then: {
          type: "sequence",
          effects: [
            {
              id: "conditional-then-draw",
              connector: "always",
              effect: { type: "draw", player: "self", count: 1 },
            },
          ],
        },
        else: {
          type: "sequence",
          effects: [
            {
              id: "conditional-else-child-draw",
              connector: "always",
              effect: { type: "draw", player: "self", count: 1 },
            },
          ],
        },
      },
    },
  ],
});

const selfRest = (): Extract<Effect, { type: "sequence" }> => ({
  type: "sequence",
  effects: [
    {
      id: "rest-self",
      connector: "always",
      effect: { type: "rest", target: { type: "self" } },
    },
  ],
});

const reorderOpponentLife = (): Extract<Effect, { type: "sequence" }> => ({
  type: "sequence",
  effects: [
    {
      id: "reorder-opponent-life",
      connector: "always",
      effect: { type: "reorderLife", player: "opponent", viewer: "self" },
    },
  ],
});

const turnOwnLifeFaceDown = (): Extract<Effect, { type: "sequence" }> => ({
  type: "sequence",
  effects: [
    {
      id: "turn-life-face-down",
      connector: "always",
      effect: { type: "setLifeFaceUp", player: "self", faceUp: false },
    },
  ],
});

test("sequence runner executes draw through root, nested, and conditional composition doors", () => {
  const cases = [
    { effect: rootDraw(), name: "root", withTrash: false },
    { effect: nestedDraw(), name: "nested", withTrash: false },
    { effect: conditionalDraw(), name: "conditional", withTrash: true },
    {
      effect: conditionalElseDraw(),
      name: "conditional else",
      withTrash: false,
    },
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

test("sequence runner executes self-target rest through the reusable rest primitive", () => {
  const state = sequenceQueueState(selfRest());
  const beforeSource = must(
    must(state.players[p1], "before p1").characters[0],
    "source character",
  );
  assert.equal(beforeSource.state, "active");

  const resolved = processEffectRuntime(state);

  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.state.pendingDecision, undefined);
  const afterSource = must(
    must(resolved.state.players[p1], "after p1").characters.find(
      (card) => card.instanceId === beforeSource.instanceId,
    ),
    "rested source character",
  );
  assert.equal(afterSource.state, "rested");
});

test("sequence runner reorders opponent Life through a private order decision", () => {
  const state = sequenceQueueState(reorderOpponentLife());
  const beforeP2 = must(state.players[p2], "before p2");
  const originalIds = beforeP2.life.map((lifeCard) => lifeCard.card.instanceId);

  const paused = processEffectRuntime(state);

  assert.equal(paused.errors, undefined);
  const decision = must(paused.state.pendingDecision, "Life order decision");
  assert.equal(decision.type, "orderCards");
  assert.equal(decision.playerId, p1);
  assert.deepEqual(
    decision.cards.map((card) => card.instanceId),
    originalIds,
  );

  const orderedIds = [...originalIds].reverse();
  const resolved = processEffectRuntime(
    applyAction(paused.state, {
      type: "respondToDecision",
      decisionId: decision.id,
      response: { type: "orderedIds", ids: orderedIds },
    }).state,
  );

  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.state.pendingDecision, undefined);
  assert.deepEqual(
    must(resolved.state.players[p2], "after p2").life.map(
      (lifeCard) => lifeCard.card.instanceId,
    ),
    orderedIds,
  );
});

test("sequence runner turns own Life cards face-down without a target whitelist", () => {
  const state = sequenceQueueState(turnOwnLifeFaceDown());
  const p1State = must(state.players[p1], "p1");
  p1State.life = p1State.life.map((lifeCard) => ({
    ...lifeCard,
    faceUp: true,
  }));

  const resolved = processEffectRuntime(state);

  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.state.pendingDecision, undefined);
  assert.equal(
    must(resolved.state.players[p1], "after p1").life.every(
      (lifeCard) => !lifeCard.faceUp,
    ),
    true,
  );
});
