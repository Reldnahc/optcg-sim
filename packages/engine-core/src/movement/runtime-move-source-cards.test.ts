import assert from "node:assert/strict";
import { test } from "vitest";

import type { CardInstance, CardRef, EffectDefinition } from "@optcg/types";

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
} from "../effect-runtime-queue/test-support.js";

const reindexCards = (
  cards: readonly CardInstance[],
  zone: "hand" | "trash",
): CardInstance[] =>
  cards.map((card, index) => ({
    ...card,
    zone: { zone, playerId: p1, slot: zone, index },
  }));

const cardRef = (card: CardInstance): CardRef => ({
  instanceId: card.instanceId,
  cardId: card.cardId,
  playerId: p1,
  zone: card.zone,
});

const setupSourceTrashToHandDefinition = (
  state: ReturnType<typeof createActiveState>,
  source: CardInstance,
): EffectDefinition => {
  const effectDefinitionId = "def-source-trash-to-hand";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "source-trash-to-hand-rules",
      sourceTextHash: "source-trash-to-hand-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...must(base.effects[0], "base effect"),
        id: toEffectId("effect-source-trash-to-hand"),
        category: "auto",
        effect: {
          type: "moveCards",
          count: 1,
          from: { player: "self", zone: "trash", source: "effectSource" },
          to: { player: "self", zone: "hand" },
          order: "original",
        },
        sourcePresencePolicy: "resolveFromDestinationZone",
        trigger: { type: "onKO" },
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

test("moveCards effect source from trash to hand moves the queued source card", () => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  const p1State = must(state.players[p1], "p1");
  const source: CardInstance = {
    ...must(p1State.hand[0], "source"),
    zone: {
      zone: "trash",
      playerId: p1,
      slot: "trash",
      index: 0,
    },
  };
  p1State.trash = [source];
  p1State.hand = reindexCards(p1State.hand.slice(1), "hand");
  const definition = setupSourceTrashToHandDefinition(state, source);
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-source-trash-to-hand"),
      timingWindowId: toTimingWindowId("window-source-trash-to-hand"),
      controllerId: p1,
      source: cardRef(source),
      sourceSnapshot: toSourceSnapshot(source, p1, p1),
      effectBlockId: must(definition.effects[0], "source move effect").id,
      sourcePresencePolicy: "resolveFromDestinationZone",
      causedBy: { type: "ruleProcess", name: "source-trash-to-hand-test" },
    },
  ];

  const result = processEffectRuntime(state);
  const player = must(result.state.players[p1], "p1 result");

  assert.equal(result.errors, undefined);
  assert.equal(player.trash.length, 0);
  assert.equal(player.hand.at(-1)?.instanceId, source.instanceId);
  assert.deepEqual(
    result.events.map((event) => event.type),
    ["cardMoved", "effectResolved", "ruleProcessingChecked"],
  );
});
