import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  EffectDefinition,
  HandSelectionId,
  CardInstance,
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

test("playSelected cardPlayed events include the effect source card", () => {
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
  for (const card of p1State.hand) {
    state.cardManifest.cards[card.cardId] = resolvedCard({
      cardId: card.cardId,
      category: "character",
      cost: 10,
      power: 1000,
    });
  }

  const effectDefinitionId = "def-play-selected-source-card-event";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    cost: 1,
    power: 1000,
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "play-selected-source-card-event-rules",
      sourceTextHash: "play-selected-source-card-event-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...must(base.effects[0], "base effect"),
        id: toEffectId("play-selected-source-card-event"),
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: {
                type: "selectCards",
                zone: "hand",
                player: "self",
                chooser: "self",
                min: 0,
                max: 1,
                filter: { categories: ["character"] },
                saveAs: "handSelection:play" as HandSelectionId,
                visibility: "chooserOnly",
              },
            },
            {
              connector: "ifPreviousSucceeded",
              effect: {
                type: "playSelected",
                selection: "handSelection:play" as HandSelectionId,
                enterRested: true,
                ignoreCost: true,
              },
            },
          ],
        },
      },
    ],
  };
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    [effectDefinitionId]: definition,
  };
  state.cardManifest.cards[source.cardId] = supportCard;
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-play-selected-source-card-event"),
      timingWindowId: toTimingWindowId(
        "window-play-selected-source-card-event",
      ),
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
      causedBy: { type: "ruleProcess", name: "play-selected-source-test" },
    },
  ];

  const paused = processEffectRuntime(state);
  const decision = must(paused.state.pendingDecision, "selection");
  assert.equal(decision.type, "selectCards");
  const selected = must(decision.candidates[0], "candidate").card;
  const resolved = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "cards", cards: [selected] },
  });

  assert.equal(resolved.errors, undefined);
  const playedEvent = resolved.events.find(
    (event) => event.type === "cardPlayed",
  );
  assert.equal(
    (playedEvent?.payload as { sourceCardId?: unknown } | undefined)
      ?.sourceCardId,
    source.cardId,
  );
});
