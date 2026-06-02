import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardInstance,
  Effect,
  EffectBlock,
  EffectDefinition,
  GameState,
  InstanceId,
  PlayerId,
} from "@optcg/types";

import { applyAction, getLegalActions } from "../actions.js";
import {
  must,
  p1,
  p2,
  resolvedCard,
  toCardId,
} from "../action-test-fixtures.js";
import {
  effectDefinition,
  passCounterStep,
  setupAttackState,
} from "../battle/test-fixtures.js";
import { hashCanonicalStateValue } from "../state/canonical-state.js";
import { filterStateForPlayer } from "../filter-state-for-player.js";

const supportedLifeTriggerDefinition = (
  cardId: ReturnType<typeof toCardId>,
  effectBody: Effect = { type: "draw", count: 1, player: "self" },
  sourcePresencePolicy:
    | "resolveFromLastKnownInformation"
    | "noSourceRequired" = "resolveFromLastKnownInformation",
): EffectDefinition => {
  const definition = effectDefinition(cardId, { type: "trigger" }, effectBody);
  const effect = must(definition.effects[0], "trigger effect");
  const effectWithoutFlags = { ...effect };
  delete effectWithoutFlags.optional;
  delete effectWithoutFlags.oncePerTurn;
  return {
    ...definition,
    effects: [
      {
        ...effectWithoutFlags,
        sourcePresencePolicy,
      },
    ],
  };
};

const openLifeTriggerDecision = (options: {
  cardIdSuffix: string;
  triggerText: string;
  definition: EffectDefinition;
}): {
  state: GameState;
  lifeCardId: ReturnType<typeof toCardId>;
  lifeInstanceId: InstanceId;
  definition: EffectDefinition;
} => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const topLife = must(p2State.life[0], "top life");
  const lifeCardId = toCardId(options.cardIdSuffix);
  const definition = options.definition;
  p2State.life[0] = {
    ...topLife,
    card: { ...topLife.card, cardId: lifeCardId },
  };
  state.cardManifest.cards[lifeCardId] = resolvedCard({
    cardId: lifeCardId,
    category: "character",
    power: 1000,
    triggerText: options.triggerText,
    support: {
      status: "implemented-dsl",
      effectDefinitionId: `def-${options.cardIdSuffix}`,
      rulesVersion: definition.metadata.rulesVersion,
      sourceTextHash: definition.metadata.sourceTextHash,
    },
  });
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    [`def-${options.cardIdSuffix}`]: definition,
  };

  const result = applyAction(state, {
    type: "declareAttack",
    attacker: {
      instanceId: p1State.leader.instanceId,
      cardId: p1State.leader.cardId,
      playerId: p1,
    },
    target: {
      instanceId: p2State.leader.instanceId,
      cardId: p2State.leader.cardId,
      playerId: p2,
    },
  });

  assert.equal(result.errors, undefined);
  const passed = passCounterStep(result.state, p2);
  assert.equal(passed.errors, undefined);
  assert.equal(passed.state.pendingDecision?.type, "confirmLifeTrigger");
  return {
    state: passed.state,
    lifeCardId,
    lifeInstanceId: topLife.card.instanceId,
    definition,
  };
};

const openSupportedLifeTriggerDecision = (): {
  state: GameState;
  lifeCardId: ReturnType<typeof toCardId>;
  lifeInstanceId: InstanceId;
  definition: EffectDefinition;
} => {
  const lifeCardId = toCardId("trigger-life-activation");
  return openLifeTriggerDecision({
    cardIdSuffix: "trigger-life-activation",
    triggerText: "TRIGGER: draw 1 card",
    definition: supportedLifeTriggerDefinition(lifeCardId),
  });
};

const ensurePlayerDeckCountFromHand = (
  state: GameState,
  playerId: PlayerId,
  count: number,
): void => {
  const player = must(state.players[playerId], "player");
  while (player.deck.length < count) {
    const refill = player.hand[0];
    assert.ok(refill !== undefined, "missing hand card for deck refill");
    player.hand = player.hand.slice(1).map((card, index) => ({
      ...card,
      zone: { zone: "hand", playerId, slot: "hand", index },
    }));
    player.deck = [
      ...player.deck,
      {
        ...refill,
        zone: {
          zone: "deck",
          playerId,
          slot: "deck",
          index: player.deck.length,
        },
      },
    ];
  }
};

test("activated life trigger emits public reveal and queued runtime events before resolving", () => {
  const { state, lifeCardId, lifeInstanceId, definition } =
    openSupportedLifeTriggerDecision();
  const decision = must(state.pendingDecision, "life trigger decision");
  const effect = must(definition.effects[0], "trigger effect");

  const result = applyAction(state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "lifeTrigger", choice: "activateTrigger" },
  });

  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision, undefined);
  assert.deepEqual(
    result.events.slice(0, 4).map((event) => event.type),
    ["decisionResolved", "cardRevealed", "triggerActivated", "effectQueued"],
  );
  const revealEvent = must(
    result.events.find((event) => event.type === "cardRevealed"),
    "cardRevealed event",
  );
  const revealPayload = JSON.stringify(revealEvent.payload);
  assert.equal(revealPayload.includes(String(lifeCardId)), true);
  assert.equal(revealPayload.includes(String(lifeInstanceId)), true);
  assert.equal(revealPayload.includes("noZone"), true);

  const queuedEvent = must(
    result.events.find((event) => event.type === "effectQueued"),
    "effectQueued event",
  );
  const queuedPayload = queuedEvent.payload as {
    effectBlockId?: unknown;
    sourcePresencePolicy?: unknown;
  };
  assert.equal(queuedPayload.effectBlockId, effect.id);
  assert.equal(
    queuedPayload.sourcePresencePolicy,
    "resolveFromLastKnownInformation",
  );

  const p2State = must(result.state.players[p2], "p2");
  assert.equal(
    p2State.life.some(
      (lifeCard) => lifeCard.card.instanceId === lifeInstanceId,
    ),
    false,
  );
  assert.equal(
    p2State.hand.some((card) => card.instanceId === lifeInstanceId),
    false,
  );
  assert.equal(result.state.effectQueue.length, 0);
  assert.equal(result.state.revealedCards.length, 0);
});

test("activated life trigger can play its source card from the trigger zone", () => {
  const lifeCardId = toCardId("trigger-play-this-card");
  const definition = supportedLifeTriggerDefinition(
    lifeCardId,
    {
      type: "playSource",
      source: { type: "triggerCard" },
      ignoreCost: true,
    },
    "noSourceRequired",
  );
  const { state, lifeInstanceId } = openLifeTriggerDecision({
    cardIdSuffix: "trigger-play-this-card",
    triggerText: "[Trigger] Play this card.",
    definition,
  });
  must(state.players[p2], "p2").characters = [];
  state.cardManifest.cards[lifeCardId] = {
    ...must(state.cardManifest.cards[lifeCardId], "trigger source metadata"),
    cost: 1,
  };
  const decision = must(state.pendingDecision, "life trigger decision");

  const result = applyAction(state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "lifeTrigger", choice: "activateTrigger" },
  });
  const p2State = must(result.state.players[p2], "p2");

  assert.equal(result.errors, undefined);
  assert.equal(
    p2State.characters.some(
      (character) => character.instanceId === lifeInstanceId,
    ),
    true,
  );
  assert.equal(
    p2State.trash.some((card) => card.instanceId === lifeInstanceId),
    false,
  );
  assert.equal(result.state.revealedCards.length, 0);
  assert.deepEqual(
    result.events
      .map((event) => event.type)
      .filter(
        (type) =>
          type === "cardMoved" ||
          type === "cardPlayed" ||
          type === "cardTrashed",
      ),
    ["cardMoved", "cardPlayed"],
  );
});

test("conditional life trigger playSource opens Character overflow and finishes after the response", () => {
  const lifeCardId = toCardId("trigger-conditional-play-source-overflow");
  const triggerDefinition = supportedLifeTriggerDefinition(
    lifeCardId,
    {
      type: "playSource",
      source: { type: "triggerCard" },
      ignoreCost: true,
    },
    "noSourceRequired",
  );
  const triggerEffect = must(triggerDefinition.effects[0], "trigger effect");
  const definition: EffectDefinition = {
    ...triggerDefinition,
    effects: [
      {
        ...triggerEffect,
        condition: {
          type: "hasCardInZone",
          zone: "leaderArea",
          player: "self",
          filter: {
            categories: ["leader"],
            names: ["Monkey.D.Luffy"],
          },
        },
      },
    ],
  };
  const { state, lifeInstanceId } = openLifeTriggerDecision({
    cardIdSuffix: "trigger-conditional-play-source-overflow",
    triggerText:
      "[Trigger] If your Leader is [Monkey.D.Luffy], play this card.",
    definition,
  });
  const p2State = must(state.players[p2], "p2");
  const p2LeaderMetadata = must(
    state.cardManifest.cards[p2State.leader.cardId],
    "p2 leader metadata",
  );
  state.cardManifest.cards[p2State.leader.cardId] = {
    ...p2LeaderMetadata,
    name: "Monkey.D.Luffy",
  };
  state.cardManifest.cards[lifeCardId] = {
    ...must(state.cardManifest.cards[lifeCardId], "trigger source metadata"),
    cost: 1,
  };
  const existingCharacter = must(p2State.characters[0], "existing character");
  const overflowCharacters: CardInstance[] = [
    existingCharacter,
    ...p2State.hand.slice(0, 4),
  ].map((card, index) => ({
    ...card,
    zone: {
      zone: "characterArea",
      playerId: p2,
      slot: "character",
      index,
    },
    state: "active",
    attachedDon: [],
    turnPlayed: 1,
  }));
  assert.equal(overflowCharacters.length, 5);
  p2State.characters = overflowCharacters;
  p2State.hand = p2State.hand.slice(4).map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p2, slot: "hand", index },
  }));
  const decision = must(state.pendingDecision, "life trigger decision");

  const opened = applyAction(state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "lifeTrigger", choice: "activateTrigger" },
  });

  assert.equal(opened.errors, undefined);
  const overflow = must(opened.state.pendingDecision, "overflow decision");
  assert.equal(overflow.type, "selectCards");
  const trashedForOverflow = must(
    overflow.candidates[0],
    "overflow target",
  ).card;
  const resolved = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: overflow.id,
    response: { type: "cards", cards: [trashedForOverflow] },
  });
  const resolvedP2 = must(resolved.state.players[p2], "resolved p2");

  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.state.pendingDecision, undefined);
  assert.equal(resolved.state.effectQueue.length, 0);
  assert.equal(
    resolvedP2.characters.some(
      (character) => character.instanceId === lifeInstanceId,
    ),
    true,
  );
  assert.equal(
    resolvedP2.trash.some(
      (card) => card.instanceId === trashedForOverflow.instanceId,
    ),
    true,
  );
  assert.equal(
    resolved.events.some((event) => event.type === "effectResolved"),
    true,
  );
});

test("life trigger playSource queues On Play after the card enters the field", () => {
  const lifeCardId = toCardId("trigger-play-this-card-on-play");
  const triggerDefinition = supportedLifeTriggerDefinition(
    lifeCardId,
    {
      type: "playSource",
      source: { type: "triggerCard" },
      ignoreCost: true,
    },
    "noSourceRequired",
  );
  const onPlayDefinition = effectDefinition(
    lifeCardId,
    { type: "onPlay" },
    { type: "draw", count: 1, player: "self" },
  );
  const triggerEffect = must(triggerDefinition.effects[0], "trigger effect");
  const onPlayEffect = must(onPlayDefinition.effects[0], "on-play effect");
  const definition: EffectDefinition = {
    ...triggerDefinition,
    effects: [
      triggerEffect,
      {
        ...onPlayEffect,
        id: `${String(lifeCardId)}:effect:on-play-draw` as EffectBlock["id"],
      },
    ],
  };
  const { state, lifeInstanceId } = openLifeTriggerDecision({
    cardIdSuffix: "trigger-play-this-card-on-play",
    triggerText: "[Trigger] Play this card.",
    definition,
  });
  must(state.players[p2], "p2").characters = [];
  state.cardManifest.cards[lifeCardId] = {
    ...must(state.cardManifest.cards[lifeCardId], "trigger source metadata"),
    cost: 1,
  };
  ensurePlayerDeckCountFromHand(state, p2, 1);
  const startingHandCount = must(state.players[p2], "p2 before").hand.length;
  const decision = must(state.pendingDecision, "life trigger decision");

  const result = applyAction(state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "lifeTrigger", choice: "activateTrigger" },
  });
  const p2State = must(result.state.players[p2], "p2 after");
  const eventTypes = result.events.map((event) => event.type);

  assert.equal(result.errors, undefined);
  assert.equal(
    p2State.characters.some(
      (character) => character.instanceId === lifeInstanceId,
    ),
    true,
  );
  assert.equal(p2State.hand.length, startingHandCount + 1);
  assert.equal(eventTypes.includes("cardPlayed"), true);
  assert.equal(
    eventTypes.filter((eventType) => eventType === "effectQueued").length,
    2,
  );
  assert.equal(eventTypes.includes("cardDrawn"), true);
  assert.equal(result.state.effectQueue.length, 0);
  assert.equal(result.state.revealedCards.length, 0);
});

test("activated life trigger can pay a sequence cost before playing its source card", () => {
  const lifeCardId = toCardId("trigger-pay-play-this-card");
  const definition = supportedLifeTriggerDefinition(
    lifeCardId,
    {
      type: "sequence",
      effects: [
        {
          connector: "always",
          effect: {
            type: "payCost",
            cost: {
              type: "trashFromHand",
              count: 1,
              chooser: "self",
              optional: true,
            },
          },
        },
        {
          connector: "ifYouDo",
          effect: {
            type: "playSource",
            source: { type: "triggerCard" },
            ignoreCost: true,
          },
        },
      ],
    },
    "noSourceRequired",
  );
  const { state, lifeInstanceId } = openLifeTriggerDecision({
    cardIdSuffix: "trigger-pay-play-this-card",
    triggerText:
      "[Trigger] You may trash 1 card from your hand: Play this card.",
    definition,
  });
  must(state.players[p2], "p2").characters = [];
  state.cardManifest.cards[lifeCardId] = {
    ...must(state.cardManifest.cards[lifeCardId], "trigger source metadata"),
    cost: 1,
  };
  const decision = must(state.pendingDecision, "life trigger decision");

  const activated = applyAction(state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "lifeTrigger", choice: "activateTrigger" },
  });
  const payCost = must(activated.state.pendingDecision, "pay cost decision");
  assert.equal(payCost.type, "payCost");
  const trashed = must(
    must(activated.state.players[p2], "p2 after activation").hand[0],
    "payment card",
  );
  const paid = applyAction(activated.state, {
    type: "respondToDecision",
    decisionId: payCost.id,
    response: {
      type: "payment",
      optionId: "trashFromHand",
      selectedCardInstanceIds: [trashed.instanceId],
    },
  });
  const p2State = must(paid.state.players[p2], "p2 after payment");

  assert.equal(paid.errors, undefined);
  assert.equal(
    p2State.characters.some(
      (character) => character.instanceId === lifeInstanceId,
    ),
    true,
  );
  assert.equal(
    p2State.trash.some((card) => card.instanceId === trashed.instanceId),
    true,
  );
  assert.equal(paid.state.revealedCards.length, 0);
});

test("activated life trigger reveal is public while effect queue internals stay hidden from player views", () => {
  const { state, lifeCardId, lifeInstanceId } =
    openSupportedLifeTriggerDecision();
  const decision = must(state.pendingDecision, "life trigger decision");

  const result = applyAction(state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "lifeTrigger", choice: "activateTrigger" },
  });
  const forAttacker = filterStateForPlayer(result.state, p1);
  const forDefender = filterStateForPlayer(result.state, p2);

  for (const view of [forAttacker, forDefender]) {
    assert.deepEqual(view.revealedCards, []);
    const revealEvent = must(
      view.events.find((event) => event.type === "cardRevealed"),
      "player-view cardRevealed event",
    );
    const serializedRevealEvent = JSON.stringify(revealEvent);
    assert.equal(serializedRevealEvent.includes(String(lifeCardId)), true);
    assert.equal(serializedRevealEvent.includes(String(lifeInstanceId)), true);
    const serializedEvents = JSON.stringify(view.events);
    assert.equal(serializedEvents.includes("queueEntryId"), false);
    assert.equal(serializedEvents.includes("sourceSnapshot"), false);
  }
});

test("activated life trigger fails closed without mutation when trigger metadata no longer supports no-zone activation", () => {
  const { state, lifeCardId, definition } = openSupportedLifeTriggerDecision();
  const decision = must(state.pendingDecision, "life trigger decision");
  const unsupportedEffect = must(definition.effects[0], "trigger effect");
  state.cardManifest.effectDefinitions = {
    "def-life-trigger-activation": {
      ...definition,
      effects: [{ ...unsupportedEffect, optional: false }],
    },
  };
  const before = structuredClone(state);

  assert.deepEqual(
    getLegalActions(state, p2).filter(
      (action) => action.type === "respondToDecision",
    ),
    [],
  );

  const result = applyAction(state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "lifeTrigger", choice: "activateTrigger" },
  });

  assert.deepEqual(result.errors, [
    {
      type: "invalidDecisionResponse",
      reason: `Life Trigger card ${String(
        lifeCardId,
      )} is unsupported for activation.`,
    },
  ]);
  assert.deepEqual(result.events, []);
  assert.deepEqual(result.state, before);
});

test("malformed lifeTrigger choice fails closed without declining to hand", () => {
  const { state } = openSupportedLifeTriggerDecision();
  const decision = must(state.pendingDecision, "life trigger decision");
  const before = structuredClone(state);

  const result = applyAction(state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "lifeTrigger", choice: "bogus" as never },
  });

  assert.deepEqual(result.errors, [
    {
      type: "invalidDecisionResponse",
      reason: "Life Trigger choice is unsupported.",
    },
  ]);
  assert.deepEqual(result.events, []);
  assert.deepEqual(result.state, before);
});

test("activated draw-1 life trigger resolves from no zone and trashes the trigger card", () => {
  const { state, lifeCardId, lifeInstanceId } =
    openSupportedLifeTriggerDecision();
  const decision = must(state.pendingDecision, "life trigger decision");
  const originalP2 = must(state.players[p2], "p2 before deck refill");
  const refill = must(originalP2.hand[0], "p2 deck refill");
  state.players[p2] = {
    ...originalP2,
    deck: [
      ...originalP2.deck,
      {
        ...refill,
        zone: {
          zone: "deck",
          playerId: p2,
          slot: "deck",
          index: originalP2.deck.length,
        },
      },
    ],
    hand: originalP2.hand.slice(1).map((card, index) => ({
      ...card,
      zone: { zone: "hand", playerId: p2, slot: "hand", index },
    })),
  };
  const beforeP2 = must(state.players[p2], "p2 before");
  const drawnCard = must(beforeP2.deck[0], "p2 top deck");

  const result = applyAction(state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "lifeTrigger", choice: "activateTrigger" },
  });
  const afterP2 = must(result.state.players[p2], "p2 after");

  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision, undefined);
  assert.deepEqual(result.state.effectQueue, []);
  assert.deepEqual(
    result.events.map((event) => event.type),
    [
      "decisionResolved",
      "cardRevealed",
      "triggerActivated",
      "effectQueued",
      "cardDrawn",
      "cardMoved",
      "cardMoved",
      "effectResolved",
      "ruleProcessingChecked",
      "cardMoved",
      "cardTrashed",
    ],
  );
  assert.deepEqual(result.state.revealedCards, []);
  assert.equal(afterP2.deck.length, beforeP2.deck.length - 1);
  assert.equal(
    must(afterP2.hand[afterP2.hand.length - 1], "drawn card").instanceId,
    drawnCard.instanceId,
  );
  const trashedTrigger = must(afterP2.trash[0], "trashed trigger");
  assert.equal(trashedTrigger.instanceId, lifeInstanceId);
  assert.equal(trashedTrigger.cardId, lifeCardId);
  assert.deepEqual(trashedTrigger.zone, {
    zone: "trash",
    playerId: p2,
    slot: "trash",
    index: 0,
  });

  assert.equal(
    result.events.some(
      (event) =>
        event.type === "cardMoved" &&
        JSON.stringify(event.payload).includes(String(lifeCardId)) &&
        JSON.stringify(event.payload).includes("lifeTriggerResolved"),
    ),
    true,
  );
  assert.deepEqual(
    result.state.eventJournal.slice(-result.events.length),
    result.events,
  );
});

test("activated draw-2 life trigger resolves through reusable queued body gate", () => {
  const cardId = toCardId("trigger-life-draw-2-activation");
  const opened = openLifeTriggerDecision({
    cardIdSuffix: "trigger-life-draw-2-activation",
    triggerText: "TRIGGER: draw 2 cards",
    definition: supportedLifeTriggerDefinition(cardId, {
      type: "draw",
      count: 2,
      player: "self",
    }),
  });
  const decision = must(opened.state.pendingDecision, "life trigger decision");
  ensurePlayerDeckCountFromHand(opened.state, p2, 2);
  const beforeP2 = must(opened.state.players[p2], "p2 before");
  const drawnIds = beforeP2.deck.slice(0, 2).map((card) => card.instanceId);

  const result = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "lifeTrigger", choice: "activateTrigger" },
  });
  const replay = applyAction(structuredClone(opened.state), {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "lifeTrigger", choice: "activateTrigger" },
  });
  const afterP2 = must(result.state.players[p2], "p2 after");

  assert.equal(result.errors, undefined);
  assert.equal(replay.errors, undefined);
  assert.equal(result.state.pendingDecision, undefined);
  assert.equal(result.state.effectQueue.length, 0);
  assert.equal(afterP2.deck.length, beforeP2.deck.length - 2);
  assert.deepEqual(
    afterP2.hand.slice(-2).map((card) => card.instanceId),
    drawnIds,
  );
  assert.equal(
    afterP2.trash.some((card) => card.instanceId === opened.lifeInstanceId),
    true,
  );
  assert.deepEqual(
    result.events
      .filter(
        (event) =>
          event.type === "cardDrawn" ||
          event.type === "effectResolved" ||
          event.type === "cardTrashed",
      )
      .map((event) => event.type),
    ["cardDrawn", "cardDrawn", "effectResolved", "cardTrashed"],
  );
  assert.deepEqual(result.events, replay.events);
  assert.equal(result.stateHash, replay.stateHash);
  assert.equal(result.stateHash, hashCanonicalStateValue(result.state));
});

test("activated drawUpTo life trigger keeps reveal no-zone state while paused and cleans up after resolution", () => {
  const cardId = toCardId("trigger-life-draw-up-to");
  const opened = openLifeTriggerDecision({
    cardIdSuffix: "trigger-life-draw-up-to",
    triggerText: "TRIGGER: draw up to 2 cards",
    definition: supportedLifeTriggerDefinition(cardId, {
      type: "drawUpTo",
      count: 2,
      player: "self",
    }),
  });
  const decision = must(opened.state.pendingDecision, "life trigger decision");
  ensurePlayerDeckCountFromHand(opened.state, p2, 2);

  const paused = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "lifeTrigger", choice: "activateTrigger" },
  });

  assert.equal(paused.errors, undefined);
  assert.equal(paused.state.pendingDecision?.type, "chooseQuantity");
  assert.equal(paused.state.effectQueue.length, 1);
  const queued = must(paused.state.effectQueue[0], "paused queue entry");
  assert.equal(queued.source.zone?.zone, "noZone");
  assert.equal(queued.sourceSnapshot.zone.zone, "noZone");
  assert.equal(
    paused.state.revealedCards.some((record) =>
      record.cards.some((card) => card.instanceId === opened.lifeInstanceId),
    ),
    true,
  );
  assert.equal(
    must(paused.state.players[p2], "paused p2").trash.some(
      (card) => card.instanceId === opened.lifeInstanceId,
    ),
    false,
  );

  const quantityDecision = must(
    paused.state.pendingDecision,
    "chooseQuantity decision",
  );
  const resolved = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: quantityDecision.id,
    response: { type: "chooseQuantity", quantity: 1 },
  });
  const afterP2 = must(resolved.state.players[p2], "resolved p2");

  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.state.pendingDecision, undefined);
  assert.equal(resolved.state.effectQueue.length, 0);
  assert.equal(resolved.state.revealedCards.length, 0);
  assert.equal(
    afterP2.trash.some((card) => card.instanceId === opened.lifeInstanceId),
    true,
  );
  assert.deepEqual(
    resolved.events.map((event) => event.type),
    [
      "decisionResolved",
      "cardDrawn",
      "cardMoved",
      "cardMoved",
      "effectResolved",
      "ruleProcessingChecked",
      "cardMoved",
      "cardTrashed",
    ],
  );
  assert.equal(resolved.stateHash, hashCanonicalStateValue(resolved.state));
});
