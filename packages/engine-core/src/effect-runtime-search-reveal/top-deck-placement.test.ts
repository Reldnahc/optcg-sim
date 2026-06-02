import assert from "node:assert/strict";
import { test } from "vitest";

import type { EffectQueueEntry } from "../effect-runtime-queue-processing-test-support.js";
import {
  applyAction,
  createActiveState,
  filterStateForPlayer,
  must,
  p1,
  p2,
  processEffectRuntime,
  queueDrawForP1,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
  toCardId,
  toEffectId,
  toQueueEntryId,
  toSourceSnapshot,
} from "../effect-runtime-queue-processing-test-support.js";

test("queued top-deck placement chooses one destination for all looked cards", () => {
  const state = createActiveState();
  const player = must(state.players[p1], "p1");
  while (player.deck.length < 3) {
    const base = must(player.deck.at(-1), "deck card");
    player.deck.push({
      ...base,
      instanceId:
        `${String(base.instanceId)}:${String(player.deck.length)}` as typeof base.instanceId,
      zone: { ...base.zone, index: player.deck.length },
    });
  }
  for (const [index, id] of ["look-a", "look-b", "tail-c"].entries()) {
    const card = must(player.deck[index], "deck card");
    card.cardId = toCardId(id);
    state.cardManifest.cards[card.cardId] = resolvedCard({
      cardId: card.cardId,
      category: "character",
    });
  }

  const source = player.leader;
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "leader",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-top-deck-placement",
      rulesVersion: "top-deck-placement-rules",
      sourceTextHash: "top-deck-placement-source",
    },
  });
  const baseDefinition = reviewedOnPlayDrawDefinition(
    source.cardId,
    supportCard.support,
  );
  const effectBlockId = toEffectId("effect-top-deck-placement");
  state.cardManifest.cards[source.cardId] = supportCard;
  state.cardManifest.effectDefinitionsVersion =
    baseDefinition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    "def-top-deck-placement": {
      ...baseDefinition,
      effects: [
        {
          ...must(baseDefinition.effects[0], "base effect"),
          id: effectBlockId,
          trigger: { type: "whenAttacking" },
          effect: {
            type: "placeTopDeckCards",
            player: "self",
            count: 2,
            destination: "topOrBottom",
            order: "ownerChoice",
          },
          sourcePresencePolicy: "mustRemainInSameZone",
        },
      ],
    },
  };
  const queueEntry: EffectQueueEntry = {
    ...queueDrawForP1(),
    id: toQueueEntryId("queue-entry-top-deck-placement"),
    timingWindowId:
      "window-top-deck-placement" as EffectQueueEntry["timingWindowId"],
    source: {
      instanceId: source.instanceId,
      cardId: source.cardId,
      playerId: p1,
      zone: source.zone,
    },
    sourceSnapshot: toSourceSnapshot(source, p1, p1),
    effectBlockId,
    createdAtEventSeq: 1,
    queuedAtStateSeq: state.seq,
    sourcePresencePolicy: "mustRemainInSameZone",
    causedBy: { type: "ruleProcess", name: "test" },
  };
  state.effectQueue = [queueEntry];

  const opened = processEffectRuntime(state);
  assert.equal(opened.errors, undefined);
  const decision = must(opened.state.pendingDecision, "pending decision");
  assert.equal(decision.type, "orderCards");
  assert.deepEqual(
    decision.cards.map((card) => card.cardId),
    [toCardId("look-a"), toCardId("look-b")],
  );
  assert.deepEqual(decision.destination, "deck");
  assert.deepEqual(decision.placement, { type: "topOrBottom" });
  assert.equal(
    filterStateForPlayer(opened.state, p1).pendingDecision?.type,
    "orderCards",
  );
  assert.equal(
    filterStateForPlayer(opened.state, p2).pendingDecision,
    undefined,
  );

  const topCard = must(decision.cards[1], "top card");
  const secondTopCard = must(decision.cards[0], "second top card");
  const resolved = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "topBottomPlacement",
      topIds: [String(topCard.instanceId), String(secondTopCard.instanceId)],
      bottomIds: [],
    },
  });

  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.state.pendingDecision, undefined);
  assert.deepEqual(
    must(resolved.state.players[p1], "p1")
      .deck.slice(0, 3)
      .map((card) => card.cardId),
    [toCardId("look-b"), toCardId("look-a"), toCardId("tail-c")],
  );
  assert.deepEqual(
    resolved.events.map((event) => event.type),
    ["decisionResolved", "effectResolved"],
  );
});

test("top-or-bottom placement rejects splitting looked cards between destinations", () => {
  const state = createActiveState();
  const player = must(state.players[p1], "p1");
  while (player.deck.length < 3) {
    const base = must(player.deck.at(-1), "deck card");
    player.deck.push({
      ...base,
      instanceId:
        `${String(base.instanceId)}:${String(player.deck.length)}` as typeof base.instanceId,
      zone: { ...base.zone, index: player.deck.length },
    });
  }
  for (const [index, id] of ["look-a", "look-b", "tail-c"].entries()) {
    const card = must(player.deck[index], "deck card");
    card.cardId = toCardId(id);
    state.cardManifest.cards[card.cardId] = resolvedCard({
      cardId: card.cardId,
      category: "character",
    });
  }

  const source = player.leader;
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "leader",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-top-deck-placement",
      rulesVersion: "top-deck-placement-rules",
      sourceTextHash: "top-deck-placement-source",
    },
  });
  const baseDefinition = reviewedOnPlayDrawDefinition(
    source.cardId,
    supportCard.support,
  );
  const effectBlockId = toEffectId("effect-top-deck-placement");
  state.cardManifest.cards[source.cardId] = supportCard;
  state.cardManifest.effectDefinitionsVersion =
    baseDefinition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    "def-top-deck-placement": {
      ...baseDefinition,
      effects: [
        {
          ...must(baseDefinition.effects[0], "base effect"),
          id: effectBlockId,
          trigger: { type: "whenAttacking" },
          effect: {
            type: "placeTopDeckCards",
            player: "self",
            count: 2,
            destination: "topOrBottom",
            order: "ownerChoice",
          },
          sourcePresencePolicy: "mustRemainInSameZone",
        },
      ],
    },
  };
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-top-deck-placement"),
      timingWindowId:
        "window-top-deck-placement" as EffectQueueEntry["timingWindowId"],
      source: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: p1,
        zone: source.zone,
      },
      sourceSnapshot: toSourceSnapshot(source, p1, p1),
      effectBlockId,
      createdAtEventSeq: 1,
      queuedAtStateSeq: state.seq,
      sourcePresencePolicy: "mustRemainInSameZone",
      causedBy: { type: "ruleProcess", name: "test" },
    },
  ];
  const opened = processEffectRuntime(state);
  const decision = must(opened.state.pendingDecision, "pending decision");
  assert.equal(decision.type, "orderCards");
  const first = must(decision.cards[0], "first looked card");
  const second = must(decision.cards[1], "second looked card");
  const rejected = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "topBottomPlacement",
      topIds: [String(first.instanceId)],
      bottomIds: [String(second.instanceId)],
    },
  });

  assert.equal(rejected.errors?.[0]?.type, "invalidDecisionResponse");
  assert.equal(rejected.state.pendingDecision, decision);
});

test("queued fixed-top deck placement reorders all looked cards on top", () => {
  const state = createActiveState();
  const player = must(state.players[p1], "p1");
  while (player.deck.length < 4) {
    const base = must(player.deck.at(-1), "deck card");
    player.deck.push({
      ...base,
      instanceId:
        `${String(base.instanceId)}:${String(player.deck.length)}` as typeof base.instanceId,
      zone: { ...base.zone, index: player.deck.length },
    });
  }
  for (const [index, id] of [
    "look-a",
    "look-b",
    "look-c",
    "tail-d",
  ].entries()) {
    const card = must(player.deck[index], "deck card");
    card.cardId = toCardId(id);
    state.cardManifest.cards[card.cardId] = resolvedCard({
      cardId: card.cardId,
      category: "character",
    });
  }

  const source = player.leader;
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "leader",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-fixed-top-deck-placement",
      rulesVersion: "top-deck-placement-rules",
      sourceTextHash: "top-deck-placement-source",
    },
  });
  const baseDefinition = reviewedOnPlayDrawDefinition(
    source.cardId,
    supportCard.support,
  );
  const effectBlockId = toEffectId("effect-fixed-top-deck-placement");
  state.cardManifest.cards[source.cardId] = supportCard;
  state.cardManifest.effectDefinitionsVersion =
    baseDefinition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    "def-fixed-top-deck-placement": {
      ...baseDefinition,
      effects: [
        {
          ...must(baseDefinition.effects[0], "base effect"),
          id: effectBlockId,
          trigger: { type: "onPlay" },
          effect: {
            type: "placeTopDeckCards",
            player: "self",
            count: 3,
            destination: "top",
            order: "ownerChoice",
          },
          sourcePresencePolicy: "mustRemainInSameZone",
        },
      ],
    },
  };
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-fixed-top-deck-placement"),
      timingWindowId:
        "window-fixed-top-deck-placement" as EffectQueueEntry["timingWindowId"],
      source: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: p1,
        zone: source.zone,
      },
      sourceSnapshot: toSourceSnapshot(source, p1, p1),
      effectBlockId,
      createdAtEventSeq: 1,
      queuedAtStateSeq: state.seq,
      sourcePresencePolicy: "mustRemainInSameZone",
      causedBy: { type: "ruleProcess", name: "test" },
    },
  ];
  const opened = processEffectRuntime(state);
  const decision = must(opened.state.pendingDecision, "pending decision");
  assert.equal(decision.type, "orderCards");
  assert.equal(decision.placement, undefined);
  const resolved = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "orderedIds",
      ids: decision.cards
        .slice()
        .reverse()
        .map((card) => String(card.instanceId)),
    },
  });

  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.state.pendingDecision, undefined);
  assert.deepEqual(
    must(resolved.state.players[p1], "p1")
      .deck.slice(0, 4)
      .map((card) => card.cardId),
    [
      toCardId("look-c"),
      toCardId("look-b"),
      toCardId("look-a"),
      toCardId("tail-d"),
    ],
  );
  assert.deepEqual(
    resolved.events.map((event) => event.type),
    ["decisionResolved", "effectResolved"],
  );
});

test("sequence top-or-bottom deck placement resumes later segments", () => {
  const state = createActiveState();
  const player = must(state.players[p1], "p1");
  while (player.deck.length < 4) {
    const base = must(player.deck.at(-1), "deck card");
    player.deck.push({
      ...base,
      instanceId:
        `${String(base.instanceId)}:${String(player.deck.length)}` as typeof base.instanceId,
      zone: { ...base.zone, index: player.deck.length },
    });
  }
  for (const [index, id] of [
    "look-a",
    "look-b",
    "tail-c",
    "tail-d",
  ].entries()) {
    const card = must(player.deck[index], "deck card");
    card.cardId = toCardId(id);
    state.cardManifest.cards[card.cardId] = resolvedCard({
      cardId: card.cardId,
      category: "character",
    });
  }

  const source = player.leader;
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "leader",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-sequence-top-deck-placement",
      rulesVersion: "top-deck-placement-rules",
      sourceTextHash: "top-deck-placement-source",
    },
  });
  const baseDefinition = reviewedOnPlayDrawDefinition(
    source.cardId,
    supportCard.support,
  );
  const effectBlockId = toEffectId("effect-sequence-top-deck-placement");
  state.cardManifest.cards[source.cardId] = supportCard;
  state.cardManifest.effectDefinitionsVersion =
    baseDefinition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    "def-sequence-top-deck-placement": {
      ...baseDefinition,
      effects: [
        {
          ...must(baseDefinition.effects[0], "base effect"),
          id: effectBlockId,
          trigger: { type: "onPlay" },
          effect: {
            type: "sequence",
            effects: [
              {
                connector: "always",
                effect: {
                  type: "placeTopDeckCards",
                  player: "self",
                  count: 2,
                  destination: "topOrBottom",
                  order: "ownerChoice",
                },
              },
              {
                connector: "then",
                effect: { type: "draw", player: "self", count: 1 },
              },
            ],
          },
          sourcePresencePolicy: "mustRemainInSameZone",
        },
      ],
    },
  };
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-sequence-top-deck-placement"),
      timingWindowId:
        "window-sequence-top-deck-placement" as EffectQueueEntry["timingWindowId"],
      source: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: p1,
        zone: source.zone,
      },
      sourceSnapshot: toSourceSnapshot(source, p1, p1),
      effectBlockId,
      createdAtEventSeq: 1,
      queuedAtStateSeq: state.seq,
      sourcePresencePolicy: "mustRemainInSameZone",
      causedBy: { type: "ruleProcess", name: "test" },
    },
  ];
  const startingHandCount = player.hand.length;

  const opened = processEffectRuntime(state);
  assert.equal(opened.errors, undefined);
  const decision = must(opened.state.pendingDecision, "pending decision");
  assert.equal(decision.type, "orderCards");
  assert.deepEqual(decision.placement, { type: "topOrBottom" });
  const first = must(decision.cards[0], "first looked card");
  const second = must(decision.cards[1], "second looked card");

  const resolved = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "topBottomPlacement",
      topIds: [],
      bottomIds: [String(second.instanceId), String(first.instanceId)],
    },
  });

  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.state.pendingDecision, undefined);
  const resolvedHand = must(resolved.state.players[p1], "p1").hand;
  assert.equal(resolvedHand.length, startingHandCount + 1);
  assert.equal(resolvedHand.at(-1)?.cardId, toCardId("tail-c"));
  assert.deepEqual(
    must(resolved.state.players[p1], "p1")
      .deck.slice(0, 3)
      .map((card) => card.cardId),
    [toCardId("tail-d"), toCardId("look-b"), toCardId("look-a")],
  );
  assert.deepEqual(
    resolved.events.map((event) => event.type),
    [
      "decisionResolved",
      "cardDrawn",
      "cardMoved",
      "cardMoved",
      "effectResolved",
    ],
  );
});
