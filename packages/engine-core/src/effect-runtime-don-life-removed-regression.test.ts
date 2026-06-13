import assert from "node:assert/strict";
import { test } from "vitest";

import type { Effect, EffectDefinition, SelectionId } from "@optcg/types";

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
} from "./effect-runtime-queue/test-support.js";

const restedDonToLeaderThenOpponentLifeToHandSequence = (): Extract<
  Effect,
  { type: "sequence" }
> => ({
  type: "sequence",
  effects: [
    {
      connector: "always",
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            saveResultAs: "donSelection:attach",
            effect: {
              type: "selectCards",
              zone: "costArea",
              player: "self",
              chooser: "self",
              min: 0,
              max: 1,
              filter: { categories: ["don"], state: "rested" },
              saveAs: "donSelection:attach" as SelectionId,
              visibility: "bothPlayers",
            },
          },
          {
            connector: "ifYouDo",
            saveResultAs: "targetSelection:attach-don",
            effect: {
              type: "selectTargets",
              request: {
                timing: "onResolution",
                chooser: "self",
                player: "self",
                zones: ["leaderArea", "characterArea"],
                filter: { categories: ["leader"] },
                min: 1,
                max: 1,
                allowFewerIfUnavailable: false,
                visibility: "public",
              },
            },
          },
          {
            connector: "then",
            effect: {
              type: "attachSelectedDon",
              selection: "donSelection:attach" as SelectionId,
              target: {
                type: "savedFieldObject",
                binding: {
                  family: "selectedTargets",
                  saveResultAs: "targetSelection:attach-don",
                },
                zones: ["leaderArea", "characterArea"],
                player: "self",
                filter: { categories: ["leader"] },
                visibility: "publicOnly",
                onFailure: "failClosed",
              },
            },
          },
        ],
      },
    },
    {
      connector: "then",
      effect: {
        type: "conditional",
        if: { type: "lifeCount", player: "opponent", op: "gte", value: 3 },
        then: {
          type: "moveCards",
          min: 0,
          count: 1,
          from: { player: "opponent", zone: "life", position: "top" },
          to: { player: "owner", zone: "hand" },
          order: "original",
        },
      },
    },
  ],
});

const setupOnPlaySequence = (
  state: ReturnType<typeof createActiveState>,
  effect: Effect,
): EffectDefinition => {
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const source = must(p1State.leader, "source leader");
  const effectDefinitionId = "def-don-life";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "leader",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "don-life-rules",
      sourceTextHash: "don-life-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...must(base.effects[0], "base effect"),
        id: toEffectId("effect-don-life"),
        sourcePresencePolicy: "mustRemainInSameZone",
        effect,
      },
    ],
  };
  const restedDon = must(p1State.donDeck[0], "rested DON source");
  p1State.donDeck = p1State.donDeck.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "donDeck", playerId: p1, slot: "donDeck", index },
  }));
  p1State.costArea = [
    {
      ...restedDon,
      state: "rested",
      zone: { zone: "costArea", playerId: p1, slot: "cost", index: 0 },
    },
  ];
  while (p2State.life.length < 3) {
    const nextLifeCard = must(p2State.deck[0], "opponent deck for Life");
    p2State.deck = p2State.deck.slice(1).map((card, index) => ({
      ...card,
      zone: { zone: "deck", playerId: p2, slot: "deck", index },
    }));
    p2State.life = [
      ...p2State.life,
      {
        faceUp: false,
        card: {
          ...nextLifeCard,
          zone: {
            zone: "life",
            playerId: p2,
            slot: "life",
            index: p2State.life.length,
          },
        },
      },
    ];
  }
  state.cardManifest.cards[source.cardId] = supportCard;
  for (const don of [...p1State.costArea, ...p1State.donDeck]) {
    state.cardManifest.cards[don.cardId] = resolvedCard({
      cardId: don.cardId,
      category: "don",
    });
  }
  for (const lifeCard of p2State.life) {
    state.cardManifest.cards[lifeCard.card.cardId] = resolvedCard({
      cardId: lifeCard.card.cardId,
      category: "character",
    });
  }
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    [effectDefinitionId]: definition,
  };
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry:don-life"),
      timingWindowId: toTimingWindowId("timing-window:don-life"),
      controllerId: p1,
      source: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: p1,
        zone: source.zone,
      },
      sourceSnapshot: toSourceSnapshot(source, p1, p1),
      effectBlockId: must(definition.effects[0], "effect").id,
      sourcePresencePolicy: "mustRemainInSameZone",
      causedBy: { type: "ruleProcess", name: "effectRuntime:onPlay" },
    },
  ];
  return definition;
};

const installLifeRemovedReaction = (
  state: ReturnType<typeof createActiveState>,
): void => {
  const p1State = must(state.players[p1], "p1 for reaction");
  const source = withCardInZone({
    state,
    playerId: p1,
    card: must(p1State.hand[0], "reaction source"),
    zone: "characterArea",
  });
  p1State.hand = p1State.hand.filter(
    (card) => card.instanceId !== source.instanceId,
  );
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
  const effect = must(base.effects[0], "base reaction effect");
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...effect,
        id: toEffectId("effect-life-removed-reaction"),
        trigger: { type: "lifeRemoved", players: ["opponent"] },
        sourcePresencePolicy: "mustRemainInSameZone",
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: { type: "draw", player: "self", count: 1 },
            },
          ],
        },
      },
    ],
  };
  state.cardManifest.cards[source.cardId] = supportCard;
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    [effectDefinitionId]: definition,
  };
};

test("opponent Life removed after nested DON attachment queues lifeRemoved reactions", () => {
  const state = createActiveState();
  setupOnPlaySequence(state, restedDonToLeaderThenOpponentLifeToHandSequence());
  installLifeRemovedReaction(state);

  const selectDonResult = processEffectRuntime(state);
  const selectDon = must(selectDonResult.state.pendingDecision, "select DON");
  assert.equal(selectDonResult.errors, undefined);
  assert.equal(selectDon.type, "selectCards");

  const selectedDon = applyAction(selectDonResult.state, {
    type: "respondToDecision",
    decisionId: selectDon.id,
    response: {
      type: "cards",
      cards: [must(selectDon.candidates[0], "DON candidate").card],
    },
  });
  const selectLeader = must(selectedDon.state.pendingDecision, "select leader");
  assert.equal(selectedDon.errors, undefined);
  assert.equal(selectLeader.type, "selectTargets");

  const selectedLeader = applyAction(selectedDon.state, {
    type: "respondToDecision",
    decisionId: selectLeader.id,
    response: {
      type: "targets",
      targets: [must(selectLeader.candidates[0], "leader candidate").card],
    },
  });
  const chooseLifeQuantity = must(
    selectedLeader.state.pendingDecision,
    "choose opponent Life quantity",
  );
  assert.equal(selectedLeader.errors, undefined);
  assert.equal(chooseLifeQuantity.type, "chooseQuantity");

  const movedLife = applyAction(selectedLeader.state, {
    type: "respondToDecision",
    decisionId: chooseLifeQuantity.id,
    response: { type: "chooseQuantity", quantity: 1 },
  });

  assert.equal(movedLife.errors, undefined);
  assert.equal(
    movedLife.events.some(
      (event) =>
        event.type === "effectQueued" &&
        event.causedBy?.type === "ruleProcess" &&
        event.causedBy.name === "effectRuntime:eventReactionTriggerQueueing",
    ),
    true,
  );
});
