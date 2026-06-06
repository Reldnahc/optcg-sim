import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardInstance,
  Effect,
  EffectDefinition,
  GameState,
  HandSelectionId,
} from "@optcg/types";

import { applyAction } from "./actions.js";
import {
  addExtraDeckCard,
  createActiveState,
  must,
  p1,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
} from "./action-test-fixtures.js";
import { processEffectRuntime } from "./effect-runtime.js";
import {
  queueDrawForP1,
  toEffectId,
  toQueueEntryId,
  toSourceSnapshot,
  toTimingWindowId,
  withCardInZone,
} from "./effect-runtime-queue/test-support.js";

const reindexHand = (cards: readonly CardInstance[]): CardInstance[] =>
  cards.map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p1, slot: "hand", index },
  }));

const deckTopToLifeTopEffect = (count: number): Effect => ({
  type: "moveCards",
  min: 0,
  count,
  from: { player: "self", zone: "deck", position: "top" },
  to: { player: "self", zone: "life", position: "top" },
  order: "original",
});

const addEffectDefinition = (
  state: GameState,
  effectDefinitionId: string,
  definition: EffectDefinition,
): void => {
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    [effectDefinitionId]: definition,
  };
};

const installLifeRemovedReaction = (
  state: GameState,
  source: CardInstance,
): void => {
  const effectDefinitionId = "def-life-removed-reaction";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    power: 5000,
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "life-removed-reaction-rules",
      sourceTextHash: "life-removed-reaction-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...must(base.effects[0], "base draw effect"),
        id: toEffectId("life-removed-draw-then-lock"),
        trigger: { type: "lifeRemoved", players: ["self", "opponent"] },
        condition: { type: "yourTurn" },
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: { type: "draw", count: 1, player: "self" },
            },
            {
              connector: "then",
              effect: {
                type: "preventDraw",
                player: "self",
                source: "ownEffects",
                duration: { type: "thisTurn" },
              },
            },
          ],
        },
      },
    ],
  };

  addEffectDefinition(state, effectDefinitionId, definition);
  state.cardManifest.cards[source.cardId] = supportCard;
};

const installLifeCostOnPlayDefinition = (
  state: GameState,
  source: CardInstance,
): EffectDefinition => {
  const effectDefinitionId = "def-life-cost-on-play";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    power: 5000,
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "life-cost-on-play-rules",
      sourceTextHash: "life-cost-on-play-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const handSelection = "handSelection:sky-island-play" as HandSelectionId;
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...must(base.effects[0], "base effect"),
        id: toEffectId("life-cost-conditional-life-play"),
        sourcePresencePolicy: "noSourceRequired",
        effect: {
          type: "sequence",
          effects: [
            {
              id: "cost:life-to-hand",
              connector: "always",
              saveResultAs: "paidCost",
              effect: {
                type: "payCost",
                cost: {
                  type: "moveCards",
                  count: 1,
                  chooser: "self",
                  from: { player: "self", zone: "life", position: "top" },
                  to: { player: "self", zone: "hand" },
                  order: "chooserChoice",
                  optional: true,
                },
              },
            },
            {
              id: "body:after-cost",
              connector: "ifYouDo",
              effect: {
                type: "sequence",
                effects: [
                  {
                    connector: "always",
                    effect: {
                      type: "conditional",
                      if: {
                        type: "hasCardInZone",
                        zone: "leaderArea",
                        player: "self",
                        filter: {
                          categories: ["leader"],
                          typesAny: ["Straw Hat Crew"],
                        },
                      },
                      then: deckTopToLifeTopEffect(1),
                    },
                  },
                  {
                    connector: "then",
                    effect: {
                      type: "sequence",
                      effects: [
                        {
                          id: "select:sky-island-hand",
                          connector: "always",
                          saveResultAs: handSelection,
                          effect: {
                            type: "selectCards",
                            zone: "hand",
                            player: "self",
                            chooser: "self",
                            min: 0,
                            max: 1,
                            filter: {
                              categories: ["character"],
                              typesAny: ["Sky Island"],
                              cost: { max: 5 },
                            },
                            saveAs: handSelection,
                            visibility: "chooserOnly",
                          },
                        },
                        {
                          id: "play:sky-island-from-hand",
                          connector: "ifPossible",
                          effect: {
                            type: "playSelected",
                            selection: handSelection,
                            ignoreCost: true,
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    ],
  };

  addEffectDefinition(state, effectDefinitionId, definition);
  state.cardManifest.cards[source.cardId] = supportCard;
  return definition;
};

test("lifeRemoved reaction queues when an on-play optional life cost removes Life", () => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  state.turn.phase = "main";
  addExtraDeckCard(state, p1);
  const player = must(state.players[p1], "p1");
  const source = must(player.hand[0], "life cost source");
  const playCandidate = must(player.hand[1], "play candidate");
  const reactionSource = withCardInZone({
    state,
    playerId: p1,
    card: must(player.hand[2], "life removed reaction source"),
    zone: "characterArea",
  });
  player.hand = reindexHand(
    player.hand.filter((card) => card.instanceId !== reactionSource.instanceId),
  );
  const topLife = must(player.life[0], "top life").card;
  const topDeck = must(player.deck[0], "top deck");
  state.cardManifest.cards[player.leader.cardId] = {
    ...resolvedCard({
      cardId: player.leader.cardId,
      category: "leader",
      power: 5000,
    }),
    types: ["Straw Hat Crew"],
  };
  state.cardManifest.cards[playCandidate.cardId] = {
    ...resolvedCard({
      cardId: playCandidate.cardId,
      category: "character",
      cost: 5,
      power: 5000,
    }),
    types: ["Sky Island"],
  };
  installLifeRemovedReaction(state, reactionSource);
  const definition = installLifeCostOnPlayDefinition(state, source);
  const effectBlock = must(definition.effects[0], "life cost on-play effect");
  const handLengthBeforeCost = player.hand.length;
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-life-cost-on-play"),
      timingWindowId: toTimingWindowId("window-life-cost-on-play"),
      controllerId: p1,
      source: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: p1,
        zone: source.zone,
      },
      sourceSnapshot: toSourceSnapshot(source, p1, p1),
      effectBlockId: effectBlock.id,
      sourcePresencePolicy: "noSourceRequired",
      causedBy: { type: "ruleProcess", name: "test:life-cost-on-play" },
    },
  ];

  const costPaused = processEffectRuntime(state);
  const costDecision = must(costPaused.state.pendingDecision, "cost decision");
  assert.equal(costPaused.errors, undefined);
  assert.equal(costDecision.type, "payCost");

  const costPaid = applyAction(costPaused.state, {
    type: "respondToDecision",
    decisionId: costDecision.id,
    response: {
      type: "payment",
      optionId: "moveCards:top",
      selectedCardInstanceIds: [topLife.instanceId],
    },
  });
  const quantityDecision = must(
    costPaid.state.pendingDecision,
    "deck-to-life quantity decision",
  );
  assert.equal(costPaid.errors, undefined);
  assert.equal(quantityDecision.type, "chooseQuantity");

  const lifeAdded = applyAction(costPaid.state, {
    type: "respondToDecision",
    decisionId: quantityDecision.id,
    response: { type: "chooseQuantity", quantity: 1 },
  });
  const selectDecision = must(
    lifeAdded.state.pendingDecision,
    "Sky Island play selection",
  );
  const afterLifeAdded = must(lifeAdded.state.players[p1], "after life added");
  assert.equal(lifeAdded.errors, undefined);
  assert.equal(
    must(afterLifeAdded.life[0], "new top life").card.instanceId,
    topDeck.instanceId,
  );
  assert.equal(selectDecision.type, "selectCards");

  const selected = must(selectDecision.candidates[0], "play candidate").card;
  const played = applyAction(lifeAdded.state, {
    type: "respondToDecision",
    decisionId: selectDecision.id,
    response: { type: "cards", cards: [selected] },
  });
  assert.equal(played.errors, undefined);
  assert.equal(
    must(played.state.players[p1], "after selected play").characters.some(
      (card) => card.instanceId === playCandidate.instanceId,
    ),
    true,
  );
  assert.equal(
    played.state.eventJournal.some(
      (event) =>
        event.type === "cardMoved" &&
        event.visibility.type === "public" &&
        JSON.stringify(event.payload).includes('"zone":"life"') &&
        JSON.stringify(event.payload).includes('"zone":"hand"'),
    ),
    true,
    "the optional cost should leave a public Life-to-hand cardMoved event for trigger queueing",
  );
  assert.equal(
    must(
      played.state.players[p1],
      "after selected play source",
    ).characters.some((card) => card.instanceId === reactionSource.instanceId),
    true,
    "the lifeRemoved source should still be on field when the movement trigger is scanned",
  );
  assert.equal(
    played.state.cardManifest.cards[reactionSource.cardId]?.support.status,
    "implemented-dsl",
  );

  assert.equal(
    played.state.eventJournal.some(
      (event) =>
        event.type === "effectQueued" &&
        event.causedBy?.type === "ruleProcess" &&
        event.causedBy.name === "effectRuntime:lifeRemovedTriggerQueueing",
    ),
    true,
    "paying an optional cost that moves Life to hand should queue the lifeRemoved reaction after the on-play chain resolves",
  );
  assert.equal(
    played.state.eventJournal.some(
      (event) =>
        event.type === "effectResolved" &&
        JSON.stringify(event.payload).includes(
          '"effectBlockId":"life-removed-draw-then-lock"',
        ),
    ),
    true,
  );
  const resolvedPlayer = must(
    played.state.players[p1],
    "after life removed trigger",
  );
  assert.equal(resolvedPlayer.hand.length, handLengthBeforeCost + 1);
  assert.equal(
    played.state.continuousEffects.some(
      (effect) =>
        effect.modifier.layer === "restriction" &&
        effect.modifier.operation.type === "restriction" &&
        effect.modifier.operation.restriction === "cannotDrawByOwnEffects" &&
        effect.controller === p1,
    ),
    true,
  );
});
