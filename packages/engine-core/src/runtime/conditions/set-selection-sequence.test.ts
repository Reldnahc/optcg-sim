import assert from "node:assert/strict";
import { test } from "vitest";

import type { GameState, PublicSelectCardsDecision } from "@optcg/types";

import type { EffectQueueEntry } from "../../effect-runtime-queue/test-support.js";
import { filterStateForPlayer } from "../../view/filter-state-for-player.js";
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
  toCardId,
  toEffectId,
  toQueueEntryId,
  toSourceSnapshot,
} from "../../effect-runtime-queue/test-support.js";

const createConditionedSetSelectionState = (): {
  originalTail: NonNullable<GameState["players"][typeof p1]>["deck"];
  selectedDeck: NonNullable<GameState["players"][typeof p1]>["deck"][number];
  state: GameState;
} => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1");
  while (p1State.deck.length < 5) {
    const base = must(p1State.deck.at(-1), "deck card");
    p1State.deck.push({
      ...base,
      instanceId:
        `${String(base.instanceId)}:${String(p1State.deck.length)}` as typeof base.instanceId,
      zone: { ...base.zone, index: p1State.deck.length },
    });
  }
  for (const [index, id] of [
    "queue-selection-good-type",
    "queue-selection-blue-type",
    "queue-selection-event-type",
    "queue-selection-excluded-type",
    "queue-selection-other",
  ].entries()) {
    const card = must(p1State.deck[index], "looked card");
    card.cardId = toCardId(id);
    state.cardManifest.cards[card.cardId] = {
      ...resolvedCard({
        cardId: card.cardId,
        category: id.includes("event") ? "event" : "character",
      }),
      colors: [id.includes("blue") ? "blue" : "green"],
      types: [id.includes("type") ? "Navy" : "Pirate"],
      name: id.includes("excluded") ? "Excluded" : id,
    };
  }
  const selectedDeck = must(p1State.deck[0], "selected");
  const originalTail = p1State.deck.slice(5);
  const source = p1State.leader;
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "leader",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-queue-conditioned-set-selection",
      rulesVersion: "queue-conditioned-set-selection-rules",
      sourceTextHash: "queue-conditioned-set-selection-source",
    },
  });
  const baseDefinition = reviewedOnPlayDrawDefinition(
    source.cardId,
    supportCard.support,
  );
  const sequenceEffectId = toEffectId("queue-conditioned-set-selection-effect");
  state.cardManifest.cards[source.cardId] = supportCard;
  state.cardManifest.effectDefinitionsVersion =
    baseDefinition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    "def-queue-conditioned-set-selection": {
      ...baseDefinition,
      effects: [
        {
          ...must(baseDefinition.effects[0], "base effect"),
          id: sequenceEffectId,
          condition: { type: "yourTurn" },
          effect: {
            type: "sequence",
            effects: [
              {
                connector: "always",
                effect: {
                  type: "revealTop",
                  player: "self",
                  zone: "deck",
                  count: 5,
                  saveAs: "set:conditioned-selection" as never,
                  visibility: "chooserOnly",
                },
              },
              {
                connector: "then",
                effect: {
                  type: "selectFromSet",
                  set: "set:conditioned-selection" as never,
                  chooser: "self",
                  filter: {
                    categories: ["character"],
                    colorsAny: ["green"],
                    typesAny: ["Navy"],
                    nameNot: ["Excluded"],
                  },
                  min: 0,
                  max: 1,
                  saveAs: "selected:conditioned-selection" as never,
                },
              },
              {
                connector: "ifPreviousSucceeded",
                effect: {
                  type: "revealSelected",
                  selection: "selected:conditioned-selection" as never,
                  visibility: "bothPlayers",
                },
              },
              {
                connector: "ifPreviousSucceeded",
                effect: {
                  type: "moveSelected",
                  selection: "selected:conditioned-selection" as never,
                  from: "set:conditioned-selection" as never,
                  to: "hand",
                },
              },
              {
                connector: "then",
                effect: {
                  type: "placeSetRemainder",
                  set: "set:conditioned-selection" as never,
                  owner: "self",
                  destination: "deck",
                  position: "bottom",
                  order: "chooser",
                },
              },
            ],
          },
          sourcePresencePolicy: "mustRemainInSameZone",
        },
      ],
    },
  };
  state.turn.turnPlayerId = p1;
  const queueEntry: EffectQueueEntry = {
    ...queueDrawForP1(),
    id: toQueueEntryId("queue-entry-conditioned-set-selection"),
    source: {
      instanceId: source.instanceId,
      cardId: source.cardId,
      playerId: p1,
      zone: source.zone,
    },
    sourceSnapshot: toSourceSnapshot(source, p1, p1),
    effectBlockId: sequenceEffectId,
    sourcePresencePolicy: "mustRemainInSameZone",
  };
  state.effectQueue = [queueEntry];

  return { originalTail, selectedDeck, state };
};

const publicSelectionDecision = (
  state: GameState,
): PublicSelectCardsDecision => {
  const decision = must(
    filterStateForPlayer(state, p1).pendingDecision,
    "public pending decision",
  );
  assert.equal(decision.type, "selectCards");
  return decision;
};

test("queued conditioned supported set selection pauses for private choice and then resolves", () => {
  const { originalTail, selectedDeck, state } =
    createConditionedSetSelectionState();
  const p1State = must(state.players[p1], "p1");

  const created = processEffectRuntime(state);
  assert.equal(created.errors, undefined);
  assert.deepEqual(
    created.events.map((event) => event.type),
    ["cardRevealed", "decisionCreated"],
  );
  const decision = must(created.state.pendingDecision, "pending decision");
  assert.equal(decision.type, "selectCards");
  const candidate = must(decision.candidates[0], "candidate").card;
  assert.deepEqual(
    decision.candidates.map(({ card }) => card.instanceId),
    [selectedDeck.instanceId],
  );

  const applied = applyAction(created.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "cards", cards: [candidate] },
  });
  assert.equal(applied.errors, undefined);
  assert.deepEqual(
    applied.events.map((event) => event.type),
    ["cardRevealed", "cardMoved", "decisionCreated"],
  );
  assert.equal(
    JSON.stringify(filterStateForPlayer(applied.state, p2)).includes(
      String(candidate.cardId),
    ),
    true,
  );
  const order = must(applied.state.pendingDecision, "order");
  assert.equal(order.type, "orderCards");
  const remainder = [3, 1, 0, 2].map((index) =>
    must(order.cards[index], "remainder"),
  );
  const ordered = applyAction(applied.state, {
    type: "respondToDecision",
    decisionId: order.id,
    response: {
      type: "orderedIds",
      ids: remainder.map((card) => String(card.instanceId)),
    },
  });
  assert.equal(ordered.errors, undefined);
  assert.deepEqual(
    ordered.events.map((event) => event.type),
    ["decisionResolved", "effectResolved"],
  );
  assert.deepEqual(ordered.state.effectQueue, []);
  assert.equal(ordered.state.pendingDecision, undefined);
  assert.equal(
    must(ordered.state.players[p1], "p1").hand.at(-1)?.instanceId,
    selectedDeck.instanceId,
  );
  assert.deepEqual(
    must(ordered.state.players[p1], "p1").deck.map((card) => card.instanceId),
    [...originalTail, ...remainder].map((card) => card.instanceId),
  );
  assert.equal(
    JSON.stringify(filterStateForPlayer(ordered.state, p2)).includes(
      String(must(p1State.deck[1], "hidden").cardId),
    ),
    false,
  );
});

test("queued set search still asks to order the remainder after a public-view selection response", () => {
  const { selectedDeck, state } = createConditionedSetSelectionState();

  const created = processEffectRuntime(state);
  assert.equal(created.errors, undefined);
  const publicDecision = publicSelectionDecision(created.state);
  const selected = must(
    publicDecision.candidates.find(
      (candidate) => candidate.card.instanceId === selectedDeck.instanceId,
    ),
    "public candidate",
  ).card;

  const applied = applyAction(created.state, {
    type: "respondToDecision",
    decisionId: publicDecision.id,
    response: { type: "cards", cards: [selected] },
  });

  assert.equal(applied.errors, undefined);
  assert.equal(
    filterStateForPlayer(applied.state, p1).pendingDecision?.type,
    "orderCards",
  );
});

test("queued set search still asks to order the full remainder when no card is selected", () => {
  const { state } = createConditionedSetSelectionState();

  const created = processEffectRuntime(state);
  assert.equal(created.errors, undefined);
  const publicDecision = publicSelectionDecision(created.state);

  const applied = applyAction(created.state, {
    type: "respondToDecision",
    decisionId: publicDecision.id,
    response: { type: "cards", cards: [] },
  });

  assert.equal(applied.errors, undefined);
  assert.deepEqual(
    applied.events.map((event) => event.type),
    ["decisionCreated"],
  );
  assert.equal(
    filterStateForPlayer(applied.state, p1).pendingDecision?.type,
    "orderCards",
  );
});

test("queued set selection can filter revealed opponent top deck by a saved chosen cost", () => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const opponentTop = must(p2State.deck[0], "opponent top deck");
  opponentTop.cardId = toCardId("chosen-cost-revealed-match");
  state.cardManifest.cards[opponentTop.cardId] = {
    ...resolvedCard({
      cardId: opponentTop.cardId,
      category: "character",
    }),
    cost: 4,
  };
  const source = p1State.leader;
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "leader",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-chosen-cost-set-selection",
      rulesVersion: "chosen-cost-set-selection-rules",
      sourceTextHash: "chosen-cost-set-selection-source",
    },
  });
  const baseDefinition = reviewedOnPlayDrawDefinition(
    source.cardId,
    supportCard.support,
  );
  const sequenceEffectId = toEffectId("effect-chosen-cost-set-selection");
  state.cardManifest.cards[source.cardId] = supportCard;
  state.cardManifest.effectDefinitionsVersion =
    baseDefinition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    "def-chosen-cost-set-selection": {
      ...baseDefinition,
      effects: [
        {
          ...must(baseDefinition.effects[0], "base effect"),
          id: sequenceEffectId,
          effect: {
            type: "sequence",
            effects: [
              {
                connector: "always",
                effect: {
                  type: "chooseNumber",
                  chooser: "self",
                  purpose: "cost",
                  min: 0,
                  max: 20,
                  saveAs: "chosenNumber:cost" as never,
                },
              },
              {
                connector: "then",
                effect: {
                  type: "revealTop",
                  player: "opponent",
                  zone: "deck",
                  count: 1,
                  saveAs: "set:opponent-chosen-cost" as never,
                  visibility: "bothPlayers",
                },
              },
              {
                connector: "then",
                effect: {
                  type: "selectFromSet",
                  set: "set:opponent-chosen-cost" as never,
                  chooser: "self",
                  min: 0,
                  max: 1,
                  filter: {
                    statComparisons: [
                      {
                        stat: "cost",
                        op: "eq",
                        value: {
                          type: "savedNumber",
                          selection: "chosenNumber:cost" as never,
                        },
                      },
                    ],
                  },
                  saveAs: "revealSelection:chosen-cost" as never,
                },
              },
              {
                connector: "ifPreviousSucceeded",
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
      id: toQueueEntryId("queue-entry-chosen-cost-set-selection"),
      source: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: p1,
        zone: source.zone,
      },
      sourceSnapshot: toSourceSnapshot(source, p1, p1),
      effectBlockId: sequenceEffectId,
      sourcePresencePolicy: "mustRemainInSameZone",
    },
  ];
  const beforeHandCount = p1State.hand.length;

  const chooseCost = processEffectRuntime(state);
  const quantityDecision = must(chooseCost.state.pendingDecision, "quantity");
  assert.equal(chooseCost.errors, undefined);
  assert.equal(quantityDecision.type, "chooseQuantity");
  assert.equal(quantityDecision.min, 0);
  assert.equal(quantityDecision.max, 20);

  const revealed = applyAction(chooseCost.state, {
    type: "respondToDecision",
    decisionId: quantityDecision.id,
    response: { type: "chooseQuantity", quantity: 4 },
  });
  const selectDecision = must(revealed.state.pendingDecision, "select");
  assert.equal(revealed.errors, undefined);
  assert.equal(selectDecision.type, "selectCards");
  assert.deepEqual(
    selectDecision.candidates.map((candidate) => candidate.card.instanceId),
    [opponentTop.instanceId],
  );

  const selected = applyAction(revealed.state, {
    type: "respondToDecision",
    decisionId: selectDecision.id,
    response: {
      type: "cards",
      cards: [must(selectDecision.candidates[0], "candidate").card],
    },
  });

  assert.equal(selected.errors, undefined);
  assert.equal(selected.state.pendingDecision, undefined);
  assert.equal(
    must(selected.state.players[p1], "after p1").hand.length,
    beforeHandCount + 1,
  );
});
